// ─────────────────────────────────────────────────────────────────────────────
// Guardian Pool Screen
//
// UI for joining/leaving the Guardian Pool — EcoQuest's anti-cheat validator network.
// Guardians stake SKR, earn boosted APY, and gain extra governance power.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
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
  getPoolStats,
  getUserPosition,
  joinGuardianPool,
  leaveGuardianPool,
  claimGuardianRewards,
  PoolStats,
  UserPoolPosition,
  TIER_CONFIG,
  getTierFromStake,
} from '../services/GuardianPoolService';
import { Colors } from '../utils/colors';

const GuardianPoolScreen = ({ navigation }: any) => {
  const { connected, publicKey, publicKeyBase58 } = useWallet();
  const { signTransaction } = useMWASign();

  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPoolPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeAmount, setStakeAmount] = useState('1000');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, pos] = await Promise.all([
        getPoolStats(),
        publicKeyBase58 ? getUserPosition(publicKeyBase58) : Promise.resolve(null),
      ]);
      setPoolStats(stats);
      setUserPosition(pos);
    } catch {
      Alert.alert('Error', 'Failed to load pool data');
    } finally {
      setLoading(false);
    }
  }, [publicKeyBase58]);

  useEffect(() => { load(); }, [load]);

  // ── Join Pool ────────────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (!connected || !publicKey) {
      Alert.alert('Not Connected', 'Connect your wallet first');
      return;
    }
    const amount = parseFloat(stakeAmount);
    if (!amount || amount < (poolStats?.minStake ?? 1000)) {
      Alert.alert('Minimum Stake', `Minimum stake is ${poolStats?.minStake ?? 1000} SKR`);
      return;
    }

    Alert.alert(
      '🛡️ Join Guardian Pool?',
      `Stake ${amount} SKR to become a Guardian.\nTier: ${getTierFromStake(amount).toUpperCase()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join & Sign', onPress: async () => {
            setProcessing(true);
            try {
              const sig = await joinGuardianPool(amount, publicKey, signTransaction);
              Alert.alert('✅ Welcome, Guardian!', `Staked ${amount} SKR!\nTX: ${sig.slice(0, 16)}...`);
              await load();
            } catch (err: any) {
              Alert.alert('Failed', err?.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  }, [connected, publicKey, stakeAmount, poolStats, load]);

  // ── Leave Pool ───────────────────────────────────────────────────────────────

  const handleLeave = useCallback(async () => {
    if (!publicKey) return;
    Alert.alert('Leave Guardian Pool?', 'Your SKR will be unstaked and returned.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setProcessing(true);
          try {
            const sig = await leaveGuardianPool(publicKey, signTransaction);
            Alert.alert('Left Pool', `Unstaked successfully.\nTX: ${sig.slice(0, 16)}...`);
            await load();
          } catch (err: any) {
            Alert.alert('Failed', err?.message);
          } finally {
            setProcessing(false);
          }
        },
      },
    ]);
  }, [publicKey, load]);

  // ── Claim Rewards ────────────────────────────────────────────────────────────

  const handleClaim = useCallback(async () => {
    if (!publicKey) return;
    setProcessing(true);
    try {
      const sig = await claimGuardianRewards(publicKey, signTransaction);
      Alert.alert('✅ Rewards Claimed!', `TX: ${sig.slice(0, 16)}...`);
      await load();
    } catch (err: any) {
      Alert.alert('Failed', err?.message);
    } finally {
      setProcessing(false);
    }
  }, [publicKey, load]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const tier = userPosition?.tier ?? getTierFromStake(parseFloat(stakeAmount) || 0);
  const tierCfg = TIER_CONFIG[tier];

  return (
    <View style={[styles.container, { backgroundColor: Colors.background.dark }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🛡️ Guardian Pool</Text>
          <View />
        </View>

        {loading ? (
          <ActivityIndicator color="#00ff00" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {/* Pool Stats */}
            {poolStats && (
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{(poolStats.tvlSKR / 1000).toFixed(0)}K</Text>
                  <Text style={styles.statLabel}>TVL (SKR)</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{poolStats.apy}%</Text>
                  <Text style={styles.statLabel}>Base APY</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{poolStats.memberCount}</Text>
                  <Text style={styles.statLabel}>Guardians</Text>
                </View>
              </View>
            )}

            {/* Your Position */}
            {userPosition && userPosition.isGuardian ? (
              <View style={[styles.card, { borderColor: `${TIER_CONFIG[userPosition.tier].color}60` }]}>
                <View style={styles.tierRow}>
                  <Text style={styles.tierIcon}>{TIER_CONFIG[userPosition.tier].icon}</Text>
                  <View>
                    <Text style={[styles.tierTitle, { color: TIER_CONFIG[userPosition.tier].color }]}>
                      {userPosition.tier.toUpperCase()} GUARDIAN
                    </Text>
                    <Text style={styles.tierSub}>
                      APY: {(poolStats?.apy ?? 35) + TIER_CONFIG[userPosition.tier].bonusAPY}%
                    </Text>
                  </View>
                </View>

                <View style={styles.posRow}>
                  <View style={styles.posStat}>
                    <Text style={styles.posVal}>{userPosition.stakedAmount.toLocaleString()}</Text>
                    <Text style={styles.posLabel}>Staked SKR</Text>
                  </View>
                  <View style={styles.posStat}>
                    <Text style={[styles.posVal, { color: '#00ff00' }]}>
                      +{userPosition.pendingRewards.toFixed(2)}
                    </Text>
                    <Text style={styles.posLabel}>Pending SKR</Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.claimBtn, processing && styles.btnDisabled]}
                    onPress={handleClaim}
                    disabled={processing}
                  >
                    {processing ? <ActivityIndicator color="#000" size="small" />
                      : <Text style={styles.claimBtnText}>💰 Claim Rewards</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave} disabled={processing}>
                    <Text style={styles.leaveBtnText}>Leave</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Join form
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Join Guardian Pool</Text>
                <Text style={styles.cardDesc}>
                  Stake SKR to validate eco-activities and earn boosted rewards + governance power.
                </Text>

                {/* Tier preview */}
                <View style={[styles.tierPreview, { borderColor: `${tierCfg.color}60` }]}>
                  <Text style={styles.tierPreviewIcon}>{tierCfg.icon}</Text>
                  <View>
                    <Text style={[styles.tierPreviewTitle, { color: tierCfg.color }]}>
                      {tier.toUpperCase()} TIER
                    </Text>
                    <Text style={styles.tierPreviewSub}>+{tierCfg.bonusAPY}% bonus APY</Text>
                  </View>
                </View>

                <Text style={styles.label}>Stake Amount (SKR)</Text>
                <TextInput
                  style={styles.input}
                  value={stakeAmount}
                  onChangeText={setStakeAmount}
                  keyboardType="numeric"
                  placeholderTextColor="#555"
                />

                <Text style={styles.tiers}>
                  Bronze: 1K+ · Silver: 5K+ · Gold: 10K+ · Diamond: 50K+
                </Text>

                <TouchableOpacity
                  style={[styles.joinBtn, (!connected || processing) && styles.btnDisabled]}
                  onPress={handleJoin}
                  disabled={!connected || processing}
                >
                  {processing ? <ActivityIndicator color="#000" />
                    : <Text style={styles.joinBtnText}>🛡️ Join Guardian Pool</Text>}
                </TouchableOpacity>

                {!connected && (
                  <Text style={styles.connectHint}>Connect wallet to join</Text>
                )}
              </View>
            )}

            {/* Benefits */}
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>🌟 Guardian Benefits</Text>
              {[
                { icon: '💰', text: 'Earn 35%+ APY on staked SKR' },
                { icon: '🗳️', text: '3x voting power in governance' },
                { icon: '🏆', text: 'Exclusive Guardian NFT badge' },
                { icon: '⚡', text: 'Priority quest access (+10% rewards)' },
                { icon: '🛡️', text: 'Validate eco-activities on-chain' },
              ].map((b) => (
                <View key={b.text} style={styles.benefit}>
                  <Text style={styles.benefitIcon}>{b.icon}</Text>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  backText: { color: '#00ff00', fontSize: 14 },
  title: { fontSize: 20, fontWeight: '800', color: '#fff' },
  content: { padding: 20, gap: 16 },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: 'rgba(0,255,0,0.07)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,255,0,0.2)' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#00ff00', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#888' },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(0,255,0,0.15)' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#aaa', lineHeight: 18, marginBottom: 16 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  tierIcon: { fontSize: 36 },
  tierTitle: { fontSize: 16, fontWeight: '800' },
  tierSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
  posRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  posStat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12, alignItems: 'center' },
  posVal: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  posLabel: { fontSize: 11, color: '#666' },
  actionRow: { flexDirection: 'row', gap: 10 },
  claimBtn: { flex: 1, backgroundColor: '#00ff00', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  claimBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  leaveBtn: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#ff4444', alignItems: 'center' },
  leaveBtnText: { color: '#ff4444', fontWeight: '600', fontSize: 13 },
  btnDisabled: { opacity: 0.4 },
  tierPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1 },
  tierPreviewIcon: { fontSize: 32 },
  tierPreviewTitle: { fontSize: 14, fontWeight: '700' },
  tierPreviewSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 16, fontWeight: '600', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 8 },
  tiers: { color: '#555', fontSize: 11, marginBottom: 16 },
  joinBtn: { backgroundColor: '#00ff00', borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  joinBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  connectHint: { color: '#ffaa00', fontSize: 12, textAlign: 'center', marginTop: 10 },
  benefitsCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(0,255,0,0.1)' },
  benefitsTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  benefitIcon: { fontSize: 22, width: 28 },
  benefitText: { color: '#ccc', fontSize: 13, flex: 1 },
});

export default GuardianPoolScreen;
