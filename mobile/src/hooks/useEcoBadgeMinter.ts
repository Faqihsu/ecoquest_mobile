/**
 * hooks/useEcoBadgeMinter.ts — Auto-Mint cNFT on Tree Level-Up
 *
 * Watches the user's ECO points and triggers a Bubblegum cNFT mint
 * whenever the tree advances to a new level.
 *
 * Usage:
 *   useEcoBadgeMinter(); // call in DashboardScreen or App.tsx
 *
 * Mint is gasless (relayer pays) and automatic (no user action needed
 * beyond the biometric sign prompt from MWA).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '../contexts/WalletContext';
import { useQuests } from '../contexts/QuestContext';
import {
  getTreeStageForEco,
  buildMintEcoBadgeTx,
  type EcoBadgeMetadata,
} from '../services/ecoBadgeService';
import { useGaslessTransaction } from './useGaslessTransaction';

const CO2_PER_ECO = 0.05; // 1 ECO ≈ 0.05 kg CO₂

export function useEcoBadgeMinter() {
  const { publicKeyBase58 } = useWallet();
  const { userQuests, totalEcoPoints } = useQuests();
  const { executeGasless, isProcessing } = useGaslessTransaction();
  const [lastMintedLevel, setLastMintedLevel] = useState(0);
  const prevLevelRef = useRef(0);

  // Determine current tree level
  const currentStage = getTreeStageForEco(totalEcoPoints);
  const currentLevel = currentStage.level;

  const mintBadge = useCallback(
    async (level: number) => {
      if (!publicKeyBase58 || isProcessing) return;

      try {
        const userPubkey = new PublicKey(publicKeyBase58);

        // Compute aggregate location from quests
        const questsWithCoords = userQuests.filter(
          (q) => q.latitude != null && q.longitude != null,
        );
        const avgLat =
          questsWithCoords.length > 0
            ? questsWithCoords.reduce((sum, q) => sum + (q.latitude ?? 0), 0) /
              questsWithCoords.length
            : null;
        const avgLon =
          questsWithCoords.length > 0
            ? questsWithCoords.reduce((sum, q) => sum + (q.longitude ?? 0), 0) /
              questsWithCoords.length
            : null;

        const metadata: EcoBadgeMetadata = {
          treeName: getTreeStageForEco(totalEcoPoints).name,
          treeLevel: level,
          totalCo2Saved: totalEcoPoints * CO2_PER_ECO,
          ecoPoints: totalEcoPoints,
          questCount: userQuests.length,
          latitude: avgLat,
          longitude: avgLon,
          walletAddress: publicKeyBase58,
        };

        // Build the gasless mint TX
        const tx = await buildMintEcoBadgeTx(userPubkey, metadata);

        // The gasless transaction hook handles MWA signing + sending
        // We pass the tx's instructions to executeGasless
        await executeGasless(tx.instructions);

        setLastMintedLevel(level);
        console.log(`[EcoBadge] ✅ Minted cNFT for Level ${level}: ${getTreeStageForEco(totalEcoPoints).name}`);

        Alert.alert(
          `${getTreeStageForEco(totalEcoPoints).emoji} Eco Badge Earned!`,
          `Congratulations! You've reached ${getTreeStageForEco(totalEcoPoints).name} (Level ${level}).\n\nA compressed NFT badge has been minted to your wallet!`,
          [{ text: '🎉 Awesome!' }],
        );
      } catch (err: any) {
        console.warn(`[EcoBadge] Mint failed for level ${level}:`, err?.message);
        // Don't block user experience — badge minting is a bonus feature
      }
    },
    [publicKeyBase58, totalEcoPoints, userQuests, executeGasless, isProcessing],
  );

  // Watch for level-up events
  useEffect(() => {
    if (currentLevel > prevLevelRef.current && currentLevel > lastMintedLevel) {
      // Level up detected — trigger mint
      console.log(
        `[EcoBadge] Level up detected: ${prevLevelRef.current} → ${currentLevel}`,
      );
      mintBadge(currentLevel);
    }
    prevLevelRef.current = currentLevel;
  }, [currentLevel, lastMintedLevel, mintBadge]);

  return {
    currentLevel,
    currentStage,
    lastMintedLevel,
    isMinting: isProcessing,
  };
}
