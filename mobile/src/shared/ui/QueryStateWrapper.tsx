/**
 * shared/ui/QueryStateWrapper.tsx
 *
 * Reusable wrapper that handles Loading / Error / Empty states
 * for any React Query result.
 *
 * Usage:
 *   <QueryStateWrapper query={solBalanceQuery} emptyText="Tidak ada saldo">
 *     {(data) => <Text>{data} SOL</Text>}
 *   </QueryStateWrapper>
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';

interface QueryStateWrapperProps<T> {
  query: UseQueryResult<T, Error>;
  /** Called when data is available and non-empty */
  children: (data: T) => React.ReactNode;
  /** Custom empty-state message */
  emptyText?: string;
  /** If true, treat falsy data (0, empty array) as "empty" */
  treatFalsyAsEmpty?: boolean;
  /** Compact mode (smaller spinner + text) for inline usage */
  compact?: boolean;
}

export function QueryStateWrapper<T>({
  query,
  children,
  emptyText = 'Tidak ada data',
  treatFalsyAsEmpty = false,
  compact = false,
}: QueryStateWrapperProps<T>) {
  const { data, isLoading, isFetching, error, refetch } = query;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[s.center, compact && s.centerCompact]}>
        <ActivityIndicator size={compact ? 'small' : 'large'} color="#00FF87" />
        {!compact && <Text style={s.loadingText}>Memuat data...</Text>}
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[s.center, compact && s.centerCompact]}>
        <Text style={[s.errorIcon, compact && { fontSize: 24 }]}>⚠️</Text>
        <Text style={[s.errorText, compact && { fontSize: 11 }]}>
          {error.message || 'Terjadi kesalahan'}
        </Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
          <Text style={s.retryText}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  const isEmpty = treatFalsyAsEmpty
    ? !data || (Array.isArray(data) && data.length === 0)
    : data === undefined || data === null;

  if (isEmpty) {
    return (
      <View style={[s.center, compact && s.centerCompact]}>
        <Text style={[s.emptyText, compact && { fontSize: 11 }]}>{emptyText}</Text>
      </View>
    );
  }

  // ── Data Available ───────────────────────────────────────────────────────
  return (
    <View>
      {children(data as T)}
      {/* Subtle refetch indicator (non-blocking) */}
      {isFetching && (
        <View style={s.refetchBadge}>
          <ActivityIndicator size="small" color="#00FF8755" />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCompact: {
    paddingVertical: 12,
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 13,
  },
  errorIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 260,
  },
  retryBtn: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F87171',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  retryText: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  refetchBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
