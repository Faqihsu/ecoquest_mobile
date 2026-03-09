// ─────────────────────────────────────────────────────────────────────────────
// TransactionToastProvider
//
// Global overlay that renders TransactionToast on top of the entire app.
// Provides `useTransactionToast()` hook for any component to trigger toasts.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useCallback, useState, useRef } from 'react';
import { TransactionToast, ToastState } from './TransactionToast';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShowToastOptions {
  /** Transaction label (e.g. "Stake 100 SKR") */
  label: string;
  /** Transaction signature (for Solscan link) */
  signature?: string;
  /** Friendly error message */
  errorMessage?: string;
}

interface TransactionToastContextValue {
  /** Show or update the active toast */
  showToast: (state: ToastState, options: ShowToastOptions) => void;
  /** Dismiss the current toast immediately */
  dismissToast: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TransactionToastContext = createContext<TransactionToastContextValue | null>(null);

/**
 * Hook to access the global transaction toast system.
 * Must be used within <TransactionToastProvider>.
 *
 * @example
 * const { showToast, dismissToast } = useTransactionToast();
 * showToast('awaiting_approval', { label: 'Stake 100 SKR' });
 */
export function useTransactionToast(): TransactionToastContextValue {
  const ctx = useContext(TransactionToastContext);
  if (!ctx) {
    throw new Error('useTransactionToast must be used within <TransactionToastProvider>');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface ToastData {
  state: ToastState;
  label: string;
  signature?: string;
  errorMessage?: string;
  visible: boolean;
}

export function TransactionToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData>({
    state: 'awaiting_approval',
    label: '',
    visible: false,
  });

  // Debounce rapid dismiss → show transitions
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((state: ToastState, options: ShowToastOptions) => {
    // Clear any pending dismiss
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    setToast({
      state,
      label: options.label,
      signature: options.signature,
      errorMessage: options.errorMessage,
      visible: true,
    });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
    // Clean up after animation completes
    dismissTimer.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, signature: undefined, errorMessage: undefined }));
    }, 350);
  }, []);

  return (
    <TransactionToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <TransactionToast
        state={toast.state}
        label={toast.label}
        signature={toast.signature}
        errorMessage={toast.errorMessage}
        onDismiss={dismissToast}
        visible={toast.visible}
      />
    </TransactionToastContext.Provider>
  );
}
