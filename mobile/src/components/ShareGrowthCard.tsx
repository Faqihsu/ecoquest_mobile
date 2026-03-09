/**
 * ShareGrowthCard.tsx — Capturable Share Card + Share Button
 *
 * Renders a beautiful card with tree level, ECO stats, and deep link.
 * Uses react-native-view-shot to capture the card as an image,
 * then launches native share sheet via shareMyGrowth service.
 *
 * Usage:
 *   <ShareGrowthCard ecoPoints={250} questCount={12} walletAddress="Gh7x..." />
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';

import { shareGrowth, buildDeepLink, type GrowthStats } from '../services/shareMyGrowth';

// ── Constants ─────────────────────────────────────────────────────────────────

const CO2_PER_ECO = 0.05; // 1 ECO ≈ 0.05 kg CO2

function getTreeStage(pct: number): {
  label: string;
  emoji: string;
  color: string;
  level: number;
} {
  if (pct >= 1.0) return { label: 'Ancient Tree', emoji: '✨', color: '#fbbf24', level: 6 };
  if (pct >= 0.8) return { label: 'Mature Tree', emoji: '🌴', color: '#16a34a', level: 5 };
  if (pct >= 0.6) return { label: 'Young Tree', emoji: '🌲', color: '#22c55e', level: 4 };
  if (pct >= 0.4) return { label: 'Sapling', emoji: '🌳', color: '#4ade80', level: 3 };
  if (pct >= 0.2) return { label: 'Seedling', emoji: '🌿', color: '#86efac', level: 2 };
  return { label: 'Seed', emoji: '🌱', color: '#a7f3d0', level: 1 };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ShareGrowthCardProps {
  ecoPoints: number;
  maxPoints?: number;
  questCount: number;
  walletAddress?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShareGrowthCard({
  ecoPoints,
  maxPoints = 500,
  questCount,
  walletAddress,
}: ShareGrowthCardProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const pct = Math.min(ecoPoints / maxPoints, 1);
  const stage = getTreeStage(pct);
  const co2Saved = ecoPoints * CO2_PER_ECO;
  const deepLink = buildDeepLink(walletAddress);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);

    try {
      // Capture the card as PNG
      let imageUri: string | undefined;
      if (viewShotRef.current?.capture) {
        imageUri = await viewShotRef.current.capture();
      }

      const stats: GrowthStats = {
        ecoPoints,
        maxPoints,
        totalCo2Saved: co2Saved,
        questCount,
        walletAddress,
      };

      await shareGrowth(stats, imageUri);
    } catch (err) {
      console.warn('[Share] Failed:', err);
    } finally {
      setSharing(false);
    }
  }, [ecoPoints, maxPoints, co2Saved, questCount, walletAddress, sharing]);

  return (
    <View style={styles.wrapper}>
      {/* Capturable card area */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 0.95 }}
        style={styles.captureArea}
      >
        <LinearGradient
          colors={['#0a1628', '#0d2818', '#0a1628']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.brandText}>🌏 EcoQuest</Text>
            <View style={[styles.levelPill, { borderColor: stage.color + '60' }]}>
              <Text style={[styles.levelText, { color: stage.color }]}>
                Lv.{stage.level}
              </Text>
            </View>
          </View>

          {/* Tree emoji + stage name */}
          <View style={styles.treeSection}>
            <Text style={styles.treeEmoji}>{stage.emoji}</Text>
            <Text style={[styles.stageLabel, { color: stage.color }]}>
              {stage.label}
            </Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{ecoPoints}</Text>
              <Text style={styles.statLabel}>ECO Points</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{co2Saved.toFixed(1)}kg</Text>
              <Text style={styles.statLabel}>CO₂ Saved</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{questCount}</Text>
              <Text style={styles.statLabel}>Quests</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(pct * 100)}%`,
                  backgroundColor: stage.color,
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {Math.round(pct * 100)}% Growth • {ecoPoints}/{maxPoints} ECO
          </Text>

          {/* Deep link footer */}
          <View style={styles.cardFooter}>
            <Text style={styles.footerText}>
              🌿 Join me! {deepLink.shareUrl}
            </Text>
            <Text style={styles.footerSubtext}>
              Powered by Solana • #Web3ForGood
            </Text>
          </View>
        </LinearGradient>
      </ViewShot>

      {/* Share button */}
      <TouchableOpacity
        style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
        onPress={handleShare}
        disabled={sharing}
        activeOpacity={0.7}
      >
        {sharing ? (
          <ActivityIndicator size="small" color="#0a1628" />
        ) : (
          <Text style={styles.shareBtnText}>📤 Share My Growth</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 12,
  },
  captureArea: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  levelPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  treeSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  treeEmoji: {
    fontSize: 64,
    marginBottom: 6,
  },
  stageLabel: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: 14,
  },
  cardFooter: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  footerSubtext: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.5,
  },
  shareBtn: {
    marginTop: 12,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnDisabled: {
    opacity: 0.6,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0a1628',
    letterSpacing: 0.5,
  },
});
