/**
 * WalletContext.tsx
 *
 * Global wallet React Context for EcoQuest Mobile.
 *
 * Architecture:
 * - All state lives in the Zustand `walletStore` (single source of truth)
 * - This context delegates reads/writes to the store
 * - MWA `transact()` handles the OS-level wallet chooser
 * - Session is persisted in expo-secure-store (auto-connect on restart)
 * - `useWallet()` hook works from any screen inside the provider tree
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { Alert, Linking } from "react-native";
import { PublicKey } from "@solana/web3.js";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { toPublicKeyFromBase64 } from "../shared/lib/mwa/mwaAddress";
import { useWalletStore } from "../entities/wallet/model/walletStore";
import type { WalletName } from "../entities/wallet/model/types";

// ── Types ─────────────────────────────────────────────────────────────────────

// Re-export for backward compatibility
export type { WalletName } from "../entities/wallet/model/types";

interface WalletContextValue {
  connected: boolean;
  connecting: boolean;
  publicKey: PublicKey | null;
  publicKeyBase58: string | null;
  walletName: WalletName;
  isDemoMode: boolean;
  connectWithMWA: () => Promise<void>;
  connectWithQR: (publicKeyBase58: string) => Promise<void>;
  connectAsDemo: () => void;
  disconnect: () => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

import { MWA_CONFIG } from "../shared/config/mwa";

// ── Context ───────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

export const useWallet = (): WalletContextValue => {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return ctx;
};

// ── Provider ──────────────────────────────────────────────────────────────────

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // ── Read from Zustand store ─────────────────────────────────────────────────
  const status = useWalletStore((s) => s.status);
  const storePublicKey = useWalletStore((s) => s.publicKey);
  const walletName = useWalletStore((s) => s.walletName);
  const isDemoMode = useWalletStore((s) => s.isDemoMode);
  const storeConnect = useWalletStore((s) => s.connect);
  const storeDisconnect = useWalletStore((s) => s.disconnect);
  const storeSetConnecting = useWalletStore((s) => s.setConnecting);
  const storeConnectAsDemo = useWalletStore((s) => s.connectAsDemo);
  const storeRestoreSession = useWalletStore((s) => s.restoreSession);

  const connected = status === "connected";
  const connecting = status === "connecting";

  // Derive a PublicKey object from the stored base58 string
  const publicKey = useMemo(
    () => (storePublicKey ? new PublicKey(storePublicKey) : null),
    [storePublicKey]
  );

  // ── Session Restore on mount ────────────────────────────────────────────────

  useEffect(() => {
    storeRestoreSession();
  }, [storeRestoreSession]);

  // ── MWA Connect (generic — OS handles wallet selection) ─────────────────────

  const connectWithMWA = useCallback(async () => {
    if (connecting) return;

    storeSetConnecting();

    try {
      await transact(async (wallet) => {
        // Read persisted auth_token from store
        const existingToken = useWalletStore.getState().authToken;

        let authResult: any;

        // Try reauthorize first — avoids wallet pop-up
        if (existingToken) {
          try {
            authResult = await wallet.reauthorize({
              auth_token: existingToken,
              identity: MWA_CONFIG.appIdentity,
            });
          } catch {
            // Token expired or revoked → fall through to authorize
            authResult = null;
          }
        }

        // No saved token or reauthorize failed → full authorize
        if (!authResult) {
          authResult = await wallet.authorize({
            cluster: MWA_CONFIG.cluster,
            identity: MWA_CONFIG.appIdentity,
          });
        }

        const rawAddress = authResult.accounts[0]?.address;
        if (!rawAddress) throw new Error("No account returned from wallet");

        // MWA returns Base64-encoded addresses, decode to PublicKey
        const pk = toPublicKeyFromBase64(rawAddress);
        const base58 = pk.toBase58();

        // Try to detect wallet name from wallet_uri_base
        const uriBase = (authResult as any).wallet_uri_base ?? "";
        let detectedName: WalletName = "Solana Wallet";
        if (/phantom/i.test(uriBase)) detectedName = "Phantom";
        else if (/backpack/i.test(uriBase)) detectedName = "Backpack";
        else if (/jupiter/i.test(uriBase)) detectedName = "Jupiter";

        // Persist to SecureStore + update Zustand (including auth_token)
        await storeConnect(base58, detectedName, authResult.auth_token);
      });
    } catch (err: any) {
      // ── Always nullify the failed session ─────────────────────────────
      await storeDisconnect();

      const errorMsg: string = err?.message ?? "";

      // ── User pressed back or declined — silent cleanup, no alert ─────
      const isUserCancel =
        errorMsg.includes("declined") ||
        errorMsg.includes("cancelled") ||
        errorMsg.includes("User rejected") ||
        errorMsg.includes("user rejected");

      if (isUserCancel) {
        // Session nullified, user can tap "Connect" again cleanly
        return;
      }

      // ── Wallet not installed ─────────────────────────────────────────
      const isNotInstalled =
        errorMsg.includes("No wallet") ||
        errorMsg.includes("Activity not found") ||
        errorMsg.includes("Unable to resolve") ||
        errorMsg.includes("RESOLVE_ACTIVITY");

      if (isNotInstalled) {
        Alert.alert(
          "Wallet Tidak Ditemukan",
          "Tidak ada wallet Solana yang terinstal di perangkat ini. Silakan instal Phantom, Backpack, atau wallet Solana lainnya.",
          [
            { text: "Batal", style: "cancel" },
            {
              text: "Unduh Phantom",
              onPress: () => Linking.openURL("https://phantom.app/download"),
            },
          ]
        );
      } else {
        Alert.alert(
          "Koneksi Gagal",
          errorMsg || "Gagal terhubung ke wallet. Coba lagi."
        );
      }
    }
  }, [connecting, storeSetConnecting, storeConnect, storeDisconnect]);

  // ── QR Connect (Seeker) ───────────────────────────────────────────────────────

  const connectWithQR = useCallback(
    async (publicKeyBase58: string) => {
      try {
        // Validate the address
        new PublicKey(publicKeyBase58);
        await storeConnect(publicKeyBase58, "Seeker");
      } catch {
        Alert.alert(
          "QR Tidak Valid",
          "Kode QR tidak berisi alamat Solana yang valid."
        );
      }
    },
    [storeConnect]
  );

  // ── Demo Mode Connect ──────────────────────────────────────────────────────

  const connectAsDemo = useCallback(() => {
    storeConnectAsDemo();
  }, [storeConnectAsDemo]);

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    await storeDisconnect();
  }, [storeDisconnect]);

  // ── Value ──────────────────────────────────────────────────────────────────

  const value = useMemo<WalletContextValue>(
    () => ({
      connected,
      connecting,
      publicKey,
      publicKeyBase58: storePublicKey,
      walletName,
      isDemoMode,
      connectWithMWA,
      connectWithQR,
      connectAsDemo,
      disconnect,
    }),
    [
      connected,
      connecting,
      publicKey,
      storePublicKey,
      walletName,
      isDemoMode,
      connectWithMWA,
      connectWithQR,
      connectAsDemo,
      disconnect,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};
