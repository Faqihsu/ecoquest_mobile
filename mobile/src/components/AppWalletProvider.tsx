import React, { createContext, useContext, useMemo } from "react";
import { Connection } from "@solana/web3.js";
import Constants from "expo-constants";
import { WalletProvider } from "../contexts/WalletContext";

// 🔒 HACKATHON: Locked to Devnet — no mainnet/testnet option
type Cluster = "devnet";

const cluster: Cluster = "devnet";

const RPC_ENDPOINTS: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
};

const endpoint = RPC_ENDPOINTS[cluster];

// ── Connection Context ────────────────────────────────────────────────────────

interface SolanaContextValue {
  connection: Connection;
  endpoint: string;
  cluster: Cluster;
}

const SolanaContext = createContext<SolanaContextValue | null>(null);

export const useSolanaConnection = (): SolanaContextValue => {
  const ctx = useContext(SolanaContext);
  if (!ctx) {
    throw new Error("useSolanaConnection must be used within AppWalletProvider");
  }
  return ctx;
};

/**
 * AppWalletProvider
 *
 * Provides:
 * 1. Solana RPC Connection (via SolanaContext)
 * 2. Global Wallet State (via WalletProvider from WalletContext)
 *
 * Wallet signing on mobile is handled via the Solana Mobile Wallet Adapter (MWA)
 * — there are no browser-based adapters (PhantomWalletAdapter, etc.) on React Native.
 * Signing uses transact() from @solana-mobile/mobile-wallet-adapter-protocol-web3js.
 */
export const AppWalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const connection = useMemo(
    () => new Connection(endpoint, "confirmed"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint]
  );

  const value = useMemo<SolanaContextValue>(
    () => ({ connection, endpoint, cluster }),
    [connection]
  );

  return (
    <SolanaContext.Provider value={value}>
      <WalletProvider>{children}</WalletProvider>
    </SolanaContext.Provider>
  );
};
