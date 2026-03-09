// ─────────────────────────────────────────────────────────────────────────────
// Swap Screen — SKR ↔ SOL Token Swap
//
// Allows users to swap SKR ↔ SOL via EcoQuest internal pool on Devnet.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useWallet } from '../contexts/WalletContext';
import { useMWASign } from '../hooks/useMWASign';
import {
  getSwapQuote,
  swapTokens,
  SwapQuote,
  TokenKey,
  fromSmallestUnit,
  SWAP_TOKENS,
  skrMintConfigured,
} from '../services/JupiterService';
import {
  shouldUseEcoSwap,
  getEcoSwapQuote,
  executeEcoSwap,
  EcoSwapQuote,
} from '../services/EcoSwapService';
import { Colors } from '../utils/colors';

const TOKENS: { key: TokenKey; label: string; icon: string }[] = [
  { key: 'SOL',  label: 'SOL',  icon: '◎' },
  { key: 'SKR',  label: 'SKR',  icon: '🌿' },
];

const SwapScreen = ({ navigation }: any) => {
  const { connected, publicKey, publicKeyBase58 } = useWallet();
  const { signTransaction } = useMWASign();

  const [fromToken, setFromToken] = useState<TokenKey>('SOL');
  const [toToken, setToToken]     = useState<TokenKey>('SKR');
  const [amount, setAmount]       = useState('');
  const [quote, setQuote]         = useState<SwapQuote | null>(null);
  const [ecoQuote, setEcoQuote]   = useState<EcoSwapQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [swapping, setSwapping]   = useState(false);

  const canSwap = connected && !!publicKey;
  const isEcoSwap = shouldUseEcoSwap(fromToken, toToken);
  const hasQuote = quote || ecoQuote;

  // ── Get Quote ──────────────────────────────────────────────────────────────

  const handleGetQuote = useCallback(async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }
    if (fromToken === toToken) {
      Alert.alert('Same Token', 'Please select different tokens');
      return;
    }

    setLoadingQuote(true);
    setQuote(null);
    setEcoQuote(null);
    try {
      if (isEcoSwap) {
        // SKR pairs → use internal EcoSwap
        const eq = getEcoSwapQuote(
          fromToken as 'SKR' | 'SOL',
          toToken as 'SKR' | 'SOL',
          val,
        );
        setEcoQuote(eq);
      } else {
        // SOL↔USDC → use Jupiter
        const q = await getSwapQuote(fromToken, toToken, val);
        setQuote(q);
      }
    } catch (err: any) {
      Alert.alert('Quote Failed', err?.message ?? 'Could not get quote');
    } finally {
      setLoadingQuote(false);
    }
  }, [amount, fromToken, toToken, isEcoSwap]);

  // ── Execute Swap ───────────────────────────────────────────────────────────

  const handleSwap = useCallback(async () => {
    if (!hasQuote || !publicKey) return;
    if (!canSwap) {
      Alert.alert('Not Connected', 'Please connect your wallet');
      return;
    }

    const displayOut = ecoQuote
      ? ecoQuote.outputAmount.toFixed(4)
      : fromSmallestUnit(parseInt(quote!.outAmount), toToken).toFixed(4);
    const displayImpact = ecoQuote
      ? ecoQuote.priceImpact.toFixed(2)
      : quote!.priceImpactPct.toFixed(2);

    Alert.alert(
      '🔄 Confirm Swap',
      `Swap ${amount} ${fromToken} → ~${displayOut} ${toToken}?\n\nPrice impact: ${displayImpact}%\nRoute: ${ecoQuote ? 'EcoQuest Pool' : 'Jupiter'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Swap & Sign',
          onPress: async () => {
            setSwapping(true);
            try {
              if (!publicKey) throw new Error('No public key');

              let txSig: string;
              let outAmt: number;

              if (ecoQuote) {
                // SKR swap via EcoSwap
                const result = await executeEcoSwap(
                  fromToken as 'SKR' | 'SOL',
                  toToken as 'SKR' | 'SOL',
                  parseFloat(amount),
                  publicKey,
                  signTransaction,
                );
                txSig = result.txSignature;
                outAmt = result.outputAmount;
              } else {
                // Jupiter swap
                const result = await swapTokens(
                  fromToken,
                  toToken,
                  parseFloat(amount),
                  publicKey,
                  async (tx) => {
                    const signed = await signTransaction(tx as any);
                    return signed as any;
                  },
                  50,
                );
                txSig = result.txSignature;
                outAmt = result.outputAmount;
              }

              Alert.alert(
                '✅ Swap Successful!',
                `Swapped ${amount} ${fromToken} → ${outAmt.toFixed(4)} ${toToken}\nTX: ${txSig.slice(0, 20)}...`
              );
              setQuote(null);
              setEcoQuote(null);
              setAmount('');
            } catch (err: any) {
              Alert.alert('Swap Failed', err?.message ?? 'Transaction failed');
            } finally {
              setSwapping(false);
            }
          },
        },
      ]
    );
  }, [hasQuote, quote, ecoQuote, publicKey, canSwap, amount, fromToken, toToken, signTransaction]);

  // ── Token Selector ─────────────────────────────────────────────────────────

  const renderTokenSelector = (
    selected: TokenKey,
    onSelect: (k: TokenKey) => void,
    exclude: TokenKey
  ) => (
    <View style={styles.tokenRow}>
      {TOKENS.filter((t) => t.key !== exclude).map((t) => (
        <TouchableOpacity
          key={t.key}
          style={[styles.tokenChip, selected === t.key && styles.tokenChipActive]}
          onPress={() => { onSelect(t.key); setQuote(null); setEcoQuote(null); }}
        >
          <Text style={styles.tokenIcon}>{t.icon}</Text>
          <Text style={[styles.tokenLabel, selected === t.key && styles.tokenLabelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const outAmount = ecoQuote
    ? ecoQuote.outputAmount.toFixed(6)
    : quote
      ? fromSmallestUnit(parseInt(quote.outAmount), toToken).toFixed(6)
      : '---';

  const routeLabel = ecoQuote
    ? 'EcoQuest Pool'
    : quote?.routePlan?.map((r) => r.swapInfo?.label).filter(Boolean).join(' → ') || 'Direct';

  return (
    <View style={[styles.container, { backgroundColor: Colors.background.dark }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🔄 Token Swap</Text>
          <View style={styles.networkBadge}>
            <Text style={styles.networkText}>DEVNET</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* SKR mint warning */}
          {!skrMintConfigured && (fromToken === 'SKR' || toToken === 'SKR') && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                ⚠️ SKR token belum dikonfigurasi. Set EXPO_PUBLIC_SKR_MINT di .env lalu jalankan{' '}
                <Text style={{ fontWeight: '700' }}>yarn devnet:mint-skr</Text>
              </Text>
            </View>
          )}
          {/* FROM */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>FROM</Text>
            {renderTokenSelector(fromToken, setFromToken, toToken)}
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(v) => { setAmount(v); setQuote(null); }}
              placeholder="0.00"
              placeholderTextColor="#555"
              keyboardType="numeric"
            />
          </View>

          {/* Swap Arrow */}
          <TouchableOpacity
            style={styles.swapArrowBtn}
            onPress={() => {
              const tmp = fromToken;
              setFromToken(toToken);
              setToToken(tmp);
              setQuote(null);
            }}
          >
            <Text style={styles.swapArrow}>⇅</Text>
          </TouchableOpacity>

          {/* TO */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TO</Text>
            {renderTokenSelector(toToken, setToToken, fromToken)}
            <View style={styles.outAmountBox}>
              <Text style={styles.outAmount}>{outAmount}</Text>
              <Text style={styles.outAmountToken}>{toToken}</Text>
            </View>
          </View>

          {/* Quote details */}
          {(quote || ecoQuote) && (
            <View style={styles.quoteCard}>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteKey}>Price Impact</Text>
                <Text style={[styles.quoteVal, { color: (ecoQuote?.priceImpact ?? quote?.priceImpactPct ?? 0) > 1 ? '#ff4444' : '#00ff00' }]}>
                  {(ecoQuote?.priceImpact ?? quote?.priceImpactPct ?? 0).toFixed(2)}%
                </Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteKey}>Route</Text>
                <Text style={styles.quoteVal}>{routeLabel}</Text>
              </View>
              {ecoQuote && (
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteKey}>Rate</Text>
                  <Text style={styles.quoteVal}>1 {fromToken} = {ecoQuote.rate.toFixed(4)} {toToken}</Text>
                </View>
              )}
              {quote && (
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteKey}>Min. Received</Text>
                  <Text style={styles.quoteVal}>
                    {fromSmallestUnit(parseInt(quote.otherAmountThreshold), toToken).toFixed(4)} {toToken}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Buttons */}
          {!hasQuote ? (
            <TouchableOpacity
              style={[styles.actionBtn, (!amount || loadingQuote) && styles.actionBtnDisabled]}
              onPress={handleGetQuote}
              disabled={!amount || loadingQuote}
            >
              {loadingQuote
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.actionBtnText}>{isEcoSwap ? '🌿 Get EcoSwap Quote' : 'Get Quote'}</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.swapBtn, (!canSwap || swapping) && styles.actionBtnDisabled]}
              onPress={handleSwap}
              disabled={!canSwap || swapping}
            >
              {swapping
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.actionBtnText}>{isEcoSwap ? '🌿 Swap via EcoQuest' : '🔄 Swap via Jupiter'}</Text>
              }
            </TouchableOpacity>
          )}

          {!connected && (
            <Text style={styles.connectHint}>⚠️ Connect wallet to swap</Text>
          )}

          {/* Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>🌿 SKR ↔ SOL: EcoQuest Internal Pool (1 SKR = 0.001 SOL)</Text>
            <Text style={styles.infoText}>🛡️ All swaps are real on-chain transactions</Text>
            <Text style={styles.infoText}>🌐 Connected to Devnet</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 10 },
  backText: { color: '#00ff00', fontSize: 14 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  networkBadge: { backgroundColor: 'rgba(255,170,0,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  networkText: { color: '#ffaa00', fontSize: 10, fontWeight: '700' },
  content: { padding: 20, gap: 4 },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(0,255,0,0.15)', marginBottom: 4 },
  cardLabel: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  tokenRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tokenChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tokenChipActive: { backgroundColor: 'rgba(0,255,0,0.15)', borderColor: '#00ff00' },
  tokenIcon: { fontSize: 18 },
  tokenLabel: { color: '#888', fontSize: 13, fontWeight: '600' },
  tokenLabelActive: { color: '#00ff00' },
  amountInput: { fontSize: 32, fontWeight: '700', color: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,0,0.3)', paddingVertical: 8 },
  swapArrowBtn: { alignSelf: 'center', backgroundColor: 'rgba(0,255,0,0.1)', borderRadius: 999, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: 2 },
  swapArrow: { fontSize: 22, color: '#00ff00' },
  outAmountBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  outAmount: { fontSize: 32, fontWeight: '700', color: '#00ff00' },
  outAmountToken: { fontSize: 16, color: '#888', marginBottom: 5 },
  quoteCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: 'rgba(0,255,0,0.1)', marginVertical: 8 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quoteKey: { color: '#888', fontSize: 13 },
  quoteVal: { color: '#fff', fontSize: 13, fontWeight: '600' },
  actionBtn: { backgroundColor: '#00ff00', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  actionBtnDisabled: { opacity: 0.4 },
  swapBtn: { backgroundColor: '#00cc55' },
  actionBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  connectHint: { color: '#ffaa00', fontSize: 12, textAlign: 'center', marginTop: 8 },
  infoBox: { marginTop: 20, backgroundColor: 'rgba(0,255,0,0.04)', borderRadius: 10, padding: 14, gap: 6 },
  infoText: { color: '#555', fontSize: 12 },
  warnBox: { backgroundColor: 'rgba(255,170,0,0.12)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,170,0,0.3)' },
  warnText: { color: '#ffaa00', fontSize: 12, lineHeight: 18 },
});

export default SwapScreen;
