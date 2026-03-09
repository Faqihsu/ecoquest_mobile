/**
 * EcoBadgeGalleryScreen.tsx — cNFT Gallery with Helius DAS Indexer
 *
 * Premium UI displaying the user's Eco Badge collection.
 * Reads compressed NFTs from Helius DAS API in real-time.
 *
 * Features:
 *   - Grid layout with animated badge cards
 *   - Badge rarity indicators (based on tree level)
 *   - On-chain attributes (CO₂ saved, GPS, quest count)
 *   - Empty state with progress toward next badge
 *   - Pull-to-refresh
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNFTCollection, type NFTAsset } from '../entities/token/model/useNFTCollection';
import { TREE_STAGES, getTreeStageForEco, getNextStage } from '../services/ecoBadgeService';
import { useQuests } from '../contexts/QuestContext';

const { width: W } = Dimensions.get('window');
const CARD_SIZE = (W - 48) / 2; // 2-column grid with padding

// ── Rarity Colors ─────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  '1': { border: '#6b7280', bg: 'rgba(107,114,128,0.1)', label: 'Common' },
  '2': { border: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Uncommon' },
  '3': { border: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Rare' },
  '4': { border: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', label: 'Epic' },
  '5': { border: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Legendary' },
  '6': { border: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Mythic' },
};

function getRarity(level: string): { border: string; bg: string; label: string } {
  return RARITY_COLORS[level] ?? RARITY_COLORS['1'];
}

// ── Badge Card ────────────────────────────────────────────────────────────────

function BadgeCard({
  nft,
  onPress,
}: {
  nft: NFTAsset;
  onPress: () => void;
}) {
  const levelAttr = nft.attributes.find((a) => a.trait_type === 'Tree Level');
  const co2Attr = nft.attributes.find((a) => a.trait_type === 'CO2 Saved (kg)');
  const nameAttr = nft.attributes.find((a) => a.trait_type === 'Tree Name');
  const level = levelAttr?.value ?? '1';
  const rarity = getRarity(level);
  const stage = TREE_STAGES[parseInt(level, 10) - 1] ?? TREE_STAGES[0];

  return (
    <TouchableOpacity
      style={[styles.badgeCard, { borderColor: rarity.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={['#0d1117', '#111827']}
        style={styles.badgeCardInner}
      >
        {/* Emoji badge */}
        <View style={[styles.emojiCircle, { backgroundColor: rarity.bg }]}>
          <Text style={styles.emojiText}>{stage.emoji}</Text>
        </View>

        {/* Badge name */}
        <Text style={styles.badgeName} numberOfLines={1}>
          {nameAttr?.value ?? stage.name}
        </Text>

        {/* Level + rarity */}
        <View style={styles.badgeMeta}>
          <View style={[styles.rarityPill, { backgroundColor: rarity.bg, borderColor: rarity.border }]}>
            <Text style={[styles.rarityText, { color: rarity.border }]}>
              Lv.{level} · {rarity.label}
            </Text>
          </View>
        </View>

        {/* CO₂ stat */}
        {co2Attr && (
          <Text style={styles.co2Text}>🌍 {co2Attr.value} kg CO₂</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function BadgeDetailModal({
  nft,
  visible,
  onClose,
}: {
  nft: NFTAsset | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!nft) return null;

  const levelAttr = nft.attributes.find((a) => a.trait_type === 'Tree Level');
  const level = levelAttr?.value ?? '1';
  const rarity = getRarity(level);
  const stage = TREE_STAGES[parseInt(level, 10) - 1] ?? TREE_STAGES[0];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <LinearGradient
            colors={['#0a1628', '#0d2818', '#0a1628']}
            style={styles.modalGradient}
          >
            {/* Close button */}
            <Pressable style={styles.modalClose} onPress={onClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>

            {/* Badge header */}
            <Text style={styles.modalEmoji}>{stage.emoji}</Text>
            <Text style={styles.modalTitle}>{nft.name}</Text>
            <View style={[styles.modalRarity, { borderColor: rarity.border }]}>
              <Text style={[styles.modalRarityText, { color: rarity.border }]}>
                {rarity.label} · Level {level}
              </Text>
            </View>

            {/* Attributes */}
            <View style={styles.attrGrid}>
              {nft.attributes.map((attr, i) => (
                <View key={i} style={styles.attrItem}>
                  <Text style={styles.attrLabel}>{attr.trait_type}</Text>
                  <Text style={styles.attrValue}>{attr.value}</Text>
                </View>
              ))}
            </View>

            {/* On-chain ID */}
            <Text style={styles.modalId}>
              🔗 {nft.id.slice(0, 16)}...{nft.id.slice(-8)}
            </Text>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyGallery({ ecoPoints }: { ecoPoints: number }) {
  const currentStage = getTreeStageForEco(ecoPoints);
  const nextStage = getNextStage(currentStage.level);

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🌱</Text>
      <Text style={styles.emptyTitle}>No Eco Badges Yet</Text>
      <Text style={styles.emptyDesc}>
        Complete eco-quests to level up your tree.{'\n'}
        Each level-up earns you a unique compressed NFT badge!
      </Text>
      {nextStage && (
        <View style={styles.nextStageCard}>
          <Text style={styles.nextStageLabel}>Next Badge:</Text>
          <Text style={styles.nextStageEmoji}>{nextStage.emoji}</Text>
          <Text style={styles.nextStageName}>
            {nextStage.name} — {nextStage.minEco} ECO needed
          </Text>
          <View style={styles.nextProgress}>
            <View
              style={[
                styles.nextProgressFill,
                { width: `${Math.min((ecoPoints / nextStage.minEco) * 100, 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.nextProgressText}>
            {ecoPoints} / {nextStage.minEco} ECO
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function EcoBadgeGalleryScreen() {
  const { data: allNfts = [], isLoading, refetch } = useNFTCollection();
  const { totalEcoPoints } = useQuests();
  const [selectedNft, setSelectedNft] = useState<NFTAsset | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filter for Eco Badge cNFTs only (by name or symbol)
  const ecoBadges = allNfts.filter(
    (nft) =>
      nft.name.includes('Eco Badge') ||
      nft.attributes.some((a) => a.trait_type === 'Tree Level'),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#0a1628', '#0d1117']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>🏆 Eco Badge Gallery</Text>
        <Text style={styles.headerSubtitle}>
          {ecoBadges.length} badge{ecoBadges.length !== 1 ? 's' : ''} · Compressed NFTs on Solana
        </Text>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#22c55e"
            colors={['#22c55e']}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={styles.loadingText}>Loading badges from Helius...</Text>
          </View>
        ) : ecoBadges.length === 0 ? (
          <EmptyGallery ecoPoints={totalEcoPoints} />
        ) : (
          <>
            {/* Badge grid */}
            <View style={styles.grid}>
              {ecoBadges.map((nft) => (
                <BadgeCard
                  key={nft.id}
                  nft={nft}
                  onPress={() => setSelectedNft(nft)}
                />
              ))}
            </View>

            {/* Tree stages progress */}
            <View style={styles.stagesSection}>
              <Text style={styles.stagesTitle}>🌿 Tree Stages</Text>
              {TREE_STAGES.map((stage) => {
                const earned = ecoBadges.some((b) =>
                  b.attributes.some(
                    (a) => a.trait_type === 'Tree Level' && a.value === stage.level.toString(),
                  ),
                );
                return (
                  <View key={stage.level} style={styles.stageRow}>
                    <Text style={styles.stageEmoji}>{stage.emoji}</Text>
                    <View style={styles.stageInfo}>
                      <Text style={[styles.stageName, earned && styles.stageNameEarned]}>
                        Lv.{stage.level} — {stage.name}
                      </Text>
                      <Text style={styles.stageReq}>{stage.minEco} ECO</Text>
                    </View>
                    <Text style={styles.stageCheck}>
                      {earned ? '✅' : '🔒'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Detail modal */}
      <BadgeDetailModal
        nft={selectedNft}
        visible={!!selectedNft}
        onClose={() => setSelectedNft(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: {
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,197,94,0.1)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },

  // Badge Card
  badgeCard: {
    width: CARD_SIZE,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  badgeCardInner: {
    padding: 14,
    alignItems: 'center',
  },
  emojiCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emojiText: { fontSize: 28 },
  badgeName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 6,
    textAlign: 'center',
  },
  badgeMeta: { marginBottom: 6 },
  rarityPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  co2Text: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  nextStageCard: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  nextStageLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  nextStageEmoji: { fontSize: 40, marginBottom: 8 },
  nextStageName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22c55e',
    marginBottom: 12,
  },
  nextProgress: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  nextProgressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 3,
  },
  nextProgressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
  },

  // Tree stages
  stagesSection: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
  },
  stagesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  stageEmoji: { fontSize: 22, width: 36 },
  stageInfo: { flex: 1 },
  stageName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  stageNameEarned: { color: '#22c55e' },
  stageReq: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  stageCheck: { fontSize: 16, width: 24, textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: W - 48,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalGradient: {
    padding: 24,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { color: '#ffffff', fontSize: 16 },
  modalEmoji: { fontSize: 64, marginBottom: 12 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalRarity: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 20,
  },
  modalRarityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  attrGrid: {
    width: '100%',
    gap: 8,
  },
  attrItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  attrLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  attrValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalId: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 16,
  },
});
