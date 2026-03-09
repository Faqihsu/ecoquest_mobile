/**
 * app/providers/WalletProvider.tsx
 *
 * Minimal provider shell — session restore is now handled
 * by the WalletContext (which calls walletStore.restoreSession).
 *
 * Kept as a pass-through for potential future provider-level
 * concerns (e.g., background reconnection, network listeners).
 */
import React from 'react';

interface WalletProviderProps {
  children: React.ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  return <>{children}</>;
}
