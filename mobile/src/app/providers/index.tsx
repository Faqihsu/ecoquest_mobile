/**
 * app/providers/index.tsx
 * Compose all app-level providers in correct order
 */
import React from 'react';

import { QueryProvider } from './QueryProvider';
import { WalletProvider } from './WalletProvider';

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * Provider order (outer → inner):
 * QueryProvider (React Query)
 *   └── WalletProvider (MWA state)
 *         └── children (app)
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <WalletProvider>
        {children}
      </WalletProvider>
    </QueryProvider>
  );
}
