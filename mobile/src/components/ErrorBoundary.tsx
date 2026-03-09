/**
 * components/ErrorBoundary.tsx
 *
 * Root-level error boundary to prevent force-close crashes during hackathon demo.
 * Catches unhandled errors from Solana API calls, rendering failures, etc.
 * Shows a friendly recovery UI instead of a blank crash screen.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Log for debugging — won't show in production (console stripped by babel)
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message ?? 'Unknown error';
      const isSolanaError =
        errorMessage.includes('Transaction') ||
        errorMessage.includes('RPC') ||
        errorMessage.includes('Connection') ||
        errorMessage.includes('Solana') ||
        errorMessage.includes('blockhash');

      return (
        <LinearGradient colors={['#050c14', '#0f1a2e', '#050c14']} style={styles.container}>
          <SafeAreaView style={styles.safe}>
            <View style={styles.content}>
              {/* Icon */}
              <Text style={styles.icon}>{isSolanaError ? '🔗' : '⚠️'}</Text>

              {/* Title */}
              <Text style={styles.title}>
                {isSolanaError ? 'Koneksi Blockchain Terganggu' : 'Terjadi Kesalahan'}
              </Text>

              {/* Description */}
              <Text style={styles.description}>
                {isSolanaError
                  ? 'Jaringan Solana Devnet sedang lambat atau tidak merespons. Ini normal di testnet — coba lagi dalam beberapa detik.'
                  : 'Aplikasi mengalami error yang tidak terduga. Tekan tombol di bawah untuk memulai ulang.'}
              </Text>

              {/* Error detail (collapsed) */}
              <ScrollView style={styles.errorBox} nestedScrollEnabled>
                <Text style={styles.errorText} selectable>
                  {errorMessage}
                </Text>
              </ScrollView>

              {/* Restart button */}
              <TouchableOpacity style={styles.button} onPress={this.handleRestart} activeOpacity={0.8}>
                <Text style={styles.buttonText}>🔄 Coba Lagi</Text>
              </TouchableOpacity>

              {/* Devnet badge */}
              <Text style={styles.devnet}>⚡ Devnet Mode — Hackathon Build</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: { fontSize: 56, marginBottom: 8 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#8a9bb5',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  errorBox: {
    maxHeight: 100,
    width: '100%',
    backgroundColor: 'rgba(255,50,50,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,50,50,0.2)',
  },
  errorText: {
    fontSize: 11,
    color: '#ff6b6b',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.4)',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00ff87',
  },
  devnet: {
    fontSize: 10,
    color: '#3a5a4a',
    marginTop: 24,
    letterSpacing: 0.5,
  },
});
