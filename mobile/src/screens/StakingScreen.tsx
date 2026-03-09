import { Colors } from "../utils/colors";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";

import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { useWallet } from "../contexts/WalletContext";
import { useStaking } from "../hooks/useStaking";
import { useOnChainData } from "../hooks/useSolanaData";
import { useStakerInfo, calculatePendingRewards } from "../hooks/useStakerInfo";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { useRpcStatus } from "../hooks/useRpcStatus";
import { checkAndNotifyRewards } from "../services/rewardNotifications";
import { SKR_MINT_ADDRESS, SKR_DECIMALS } from "../shared/config/constants";

const StakingScreen = ({ navigation }: any) => {
  const { connected, publicKeyBase58 } = useWallet();
  const staking = useStaking();
  const onChain = useOnChainData(publicKeyBase58);
  const { stakerInfo, refetch: refetchStaker } = useStakerInfo(publicKeyBase58);

  // Enable WebSocket → React Query auto-invalidation for this screen
  useRealtimeSync(publicKeyBase58);

  // RPC connection status for reconnecting banner
  const rpcStatus = useRpcStatus();

  // Real-time pending rewards ticker + notification check
  const [pendingRewards, setPendingRewards] = useState(0);
  useEffect(() => {
    const tick = () => {
      const rewards = calculatePendingRewards(stakerInfo);
      setPendingRewards(rewards);
      // Send local push if rewards reach claimable threshold (10 SKR)
      checkAndNotifyRewards(rewards).catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 1000); // Update every second
    return () => clearInterval(interval);
  }, [stakerInfo]);

  const [stakeAmount, setStakeAmount] = useState("1000");
  const [userTokenAccount, setUserTokenAccount] = useState<PublicKey | null>(null);

  // Derive user's SKR Associated Token Account
  useEffect(() => {
    (async () => {
      if (!publicKeyBase58 || !SKR_MINT_ADDRESS) return;
      try {
        const userPk = new PublicKey(publicKeyBase58);
        const skrMint = new PublicKey(SKR_MINT_ADDRESS);
        const ata = await getAssociatedTokenAddress(skrMint, userPk);
        setUserTokenAccount(ata);
      } catch (err) {
        console.warn("[Staking] Failed to derive ATA:", err);
      }
    })();
  }, [publicKeyBase58]);

  const handleStakeSKR = useCallback(async () => {
    if (!connected || !publicKeyBase58 || !userTokenAccount) {
      Alert.alert("Not Connected", "Please connect your wallet first");
      return;
    }

    const amount = parseFloat(stakeAmount);
    if (!stakeAmount || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    try {
      const userPk = new PublicKey(publicKeyBase58);

      // Check if staker account exists, initialize if needed
      const hasAccount = await staking.hasStakerAccount(userPk);
      if (!hasAccount) {
        Alert.alert(
          "First Time Staking",
          "Initializing your staker account... Please approve the transaction.",
        );
        await staking.initStaker(userPk);
      }

      const signature = await staking.stake(amount, {
        userPublicKey: userPk,
        userTokenAccount,
      });

      // Refresh staker info + balances immediately after tx
      refetchStaker();
      onChain.refetchAll();

      Alert.alert(
        "Success ✅",
        `Staked ${amount} SKR successfully!\n\nTx: ${signature.slice(0, 20)}...`,
      );
      setStakeAmount("");
    } catch (error: any) {
      console.error("Staking error:", error);
      Alert.alert(
        "Staking Failed",
        error?.message || "Failed to stake SKR. Please try again.",
      );
    }
  }, [connected, publicKeyBase58, userTokenAccount, stakeAmount, staking]);

  const handleUnstakeSKR = useCallback(async () => {
    if (!connected || !publicKeyBase58 || !userTokenAccount) {
      Alert.alert("Not Connected", "Please connect your wallet first");
      return;
    }

    const amount = onChain.skr; // Unstake all
    if (amount <= 0) {
      Alert.alert("No Stake", "You don't have any staked SKR");
      return;
    }

    try {
      const userPk = new PublicKey(publicKeyBase58);

      const signature = await staking.unstake(amount, {
        userPublicKey: userPk,
        userTokenAccount,
      });

      // Refresh staker info + balances immediately after tx
      refetchStaker();
      onChain.refetchAll();

      Alert.alert(
        "Success ✅",
        `Unstaked ${amount} SKR successfully!\n\nTx: ${signature.slice(0, 20)}...`,
      );
    } catch (error: any) {
      console.error("Unstaking error:", error);
      Alert.alert(
        "Error",
        error?.message || "Failed to unstake SKR. Please try again.",
      );
    }
  }, [connected, publicKeyBase58, userTokenAccount, onChain.skr, staking]);

  const handleClaimRewards = useCallback(async () => {
    if (!connected || !publicKeyBase58) {
      Alert.alert("Not Connected", "Please connect your wallet first");
      return;
    }

    try {
      const userPk = new PublicKey(publicKeyBase58);

      const signature = await staking.claimRewards({
        userPublicKey: userPk,
      });

      // Refresh staker info + balances immediately after tx
      refetchStaker();
      onChain.refetchAll();

      Alert.alert(
        "Success ✅",
        `Rewards claimed successfully!\n\nTx: ${signature.slice(0, 20)}...`,
      );
    } catch (error: any) {
      console.error("Claim rewards error:", error);
      Alert.alert(
        "Error",
        error?.message || "Failed to claim rewards. Please try again.",
      );
    }
  }, [connected, publicKeyBase58, staking]);

  const apy = 20;

  return (
    <View
      style={[styles.container, { backgroundColor: Colors.background.dark }]}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>💰 SKR Staking Hub</Text>
            <Text style={styles.subtitle}>
              Earn passive income with 2x multiplier
            </Text>
            <Text style={styles.networkBadge}>🟢 Devnet</Text>
          </View>

          {/* RPC Reconnecting Banner */}
          {rpcStatus.status === 'reconnecting' && (
            <View style={styles.reconnectBanner}>
              <ActivityIndicator size="small" color="#fbbf24" />
              <Text style={styles.reconnectText}>
                🔄 Reconnecting to {rpcStatus.provider}...
              </Text>
            </View>
          )}
          {rpcStatus.status === 'error' && (
            <View style={[styles.reconnectBanner, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }]}>
              <Text style={[styles.reconnectText, { color: '#f87171' }]}>
                ⚠️ All RPC providers unavailable
              </Text>
            </View>
          )}

          {/* Wallet Balance (live data) */}
          {connected && (
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Wallet Balance</Text>
              <Text style={styles.balanceValue}>
                {onChain.solLoading ? "..." : `${onChain.sol.toFixed(4)} SOL`}
              </Text>
              <Text style={styles.skrBalanceValue}>
                {onChain.skrLoading ? "..." : `${onChain.skr.toLocaleString()} SKR`}
              </Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => onChain.refetchAll()}
                disabled={onChain.isAnyLoading}
              >
                <Text style={styles.refreshText}>
                  {onChain.isAnyLoading ? "Refreshing..." : "🔄 Refresh"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pending Transaction Indicator */}
          {staking.isPending && (
            <View style={styles.pendingBanner}>
              <ActivityIndicator size="small" color="#00ff00" />
              <Text style={styles.pendingText}>
                Transaction in progress...
              </Text>
            </View>
          )}

          {/* Error Banner */}
          {staking.lastError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {staking.lastError}</Text>
            </View>
          )}

          {/* Staking Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>SKR Balance</Text>
              <Text style={styles.statValue}>
                {onChain.skrLoading ? "..." : onChain.skr.toLocaleString()}
              </Text>
              <Text style={styles.statCurrency}>SKR</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>APY</Text>
              <Text style={[styles.statValue, { color: "#00ff00" }]}>
                {apy}%
              </Text>
              <Text style={styles.statCurrency}>2x Multiplier</Text>
            </View>
          </View>

          {/* Stake Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stake SKR</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Amount to stake"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={stakeAmount}
                onChangeText={setStakeAmount}
                editable={!staking.isPending}
              />
              <TouchableOpacity
                style={styles.maxButton}
                onPress={() => setStakeAmount(String(Math.floor(onChain.skr)))}
                disabled={staking.isPending}
              >
                <Text style={styles.maxButtonText}>Max</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                styles.stakeButton,
                (staking.isPending || !connected) && styles.buttonDisabled,
              ]}
              onPress={handleStakeSKR}
              disabled={staking.isPending || !connected}
            >
              {staking.isPending ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.buttonText}>
                  🔒 Stake SKR
                </Text>
              )}
            </TouchableOpacity>

            {/* Simulation notice */}
            <Text style={styles.simulationNote}>
              ✓ Transaction will be simulated before sending
            </Text>
          </View>

          {/* Claim Rewards Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending Rewards</Text>
            <View style={styles.rewardsCard}>
              <View>
                <Text style={styles.rewardsLabel}>Available to Claim</Text>
                <Text style={styles.rewardsAmount}>
                  {stakerInfo && stakerInfo.stakedAmount > 0
                    ? `${pendingRewards.toFixed(4)} SKR`
                    : "No active stake"}
                </Text>
                {stakerInfo && stakerInfo.stakedAmount > 0 && (
                  <Text style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    Staked: {stakerInfo.stakedAmount.toLocaleString()} SKR
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.button, styles.claimButton]}
                onPress={handleClaimRewards}
                disabled={staking.isPending || !connected}
              >
                {staking.isPending ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.buttonText}>Claim</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Unstake Section */}
          {onChain.skr > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Unstake SKR</Text>
              <View style={styles.unstakeCard}>
                <Text style={styles.unstakeLabel}>Token Balance</Text>
                <Text style={styles.unstakeAmount}>
                  {onChain.skr.toLocaleString()} SKR
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.unstakeButton,
                  staking.isPending && styles.buttonDisabled,
                ]}
                onPress={handleUnstakeSKR}
                disabled={staking.isPending}
              >
                {staking.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Unstake All</Text>
                )}
              </TouchableOpacity>
            </View>
          )}


          {/* Guardian Delegation */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Guardian Pool Delegation</Text>
            <View style={styles.delegationCard}>
              <Text style={styles.delegationTitle}>
                Increase Voting Power
              </Text>
              <Text style={styles.delegationDesc}>
                Delegate your stake to a Guardian pool for governance
                participation
              </Text>
              <TouchableOpacity
                style={styles.delegateButton}
                disabled={!connected}
                onPress={() => navigation.navigate("GuardianPool")}
              >
                <Text style={styles.delegateButtonText}>Browse Guardians</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Info Footer */}
          <View style={styles.infoSection}>
            <Text style={styles.infoText}>
              📊 Earnings calculated daily based on your staked amount and APY
            </Text>
            <Text style={styles.infoText}>
              🔓 Unstake anytime with no lockup period
            </Text>
            <Text style={styles.infoText}>
              🔒 Transactions are simulated before signing to prevent gas waste
            </Text>
            <Text style={styles.infoText}>
              ⚡ Priority fees included for faster confirmation
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ff00",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: "#aaa",
  },
  networkBadge: {
    fontSize: 11,
    color: "#00ff88",
    marginTop: 4,
    fontWeight: "600",
  },
  balanceCard: {
    backgroundColor: "rgba(0, 255, 0, 0.1)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.2)",
  },
  balanceLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 5,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00ff00",
    marginBottom: 4,
  },
  skrBalanceValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00cc88",
    marginBottom: 10,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  refreshText: {
    color: "#00ff00",
    fontSize: 11,
    fontWeight: "600",
  },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 255, 0, 0.08)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.15)",
  },
  pendingText: {
    color: "#00ff88",
    fontSize: 13,
    fontWeight: "500",
  },
  errorBanner: {
    backgroundColor: "rgba(255, 80, 80, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255, 80, 80, 0.2)",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 12,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(0, 255, 0, 0.1)",
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.2)",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 2,
  },
  statCurrency: {
    fontSize: 11,
    color: "#666",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00ff00",
    marginBottom: 12,
  },
  rewardsCard: {
    backgroundColor: "rgba(255, 170, 0, 0.1)",
    borderRadius: 12,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 170, 0, 0.3)",
  },
  rewardsLabel: {
    fontSize: 13,
    color: "#999",
    marginBottom: 5,
  },
  rewardsAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffaa00",
  },
  inputContainer: {
    flexDirection: "row",
    marginBottom: 15,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 0, 0.2)",
  },
  maxButton: {
    marginLeft: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 255, 0, 0.2)",
    borderRadius: 8,
  },
  maxButtonText: {
    color: "#00ff00",
    fontWeight: "600",
    fontSize: 12,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  stakeButton: {
    backgroundColor: "#00ff00",
  },
  unstakeButton: {
    backgroundColor: "#ff6b6b",
  },
  claimButton: {
    backgroundColor: "#ffaa00",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 14,
  },
  simulationNote: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    marginTop: 4,
  },
  unstakeCard: {
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.2)",
  },
  unstakeLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 5,
  },
  unstakeAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ff6b6b",
  },
  delegationCard: {
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  delegationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff6b6b",
    marginBottom: 8,
  },
  delegationDesc: {
    fontSize: 13,
    color: "#ccc",
    marginBottom: 15,
    lineHeight: 18,
  },
  delegateButton: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  delegateButtonText: {
    color: "#ff6b6b",
    fontWeight: "600",
  },
  infoSection: {
    marginTop: 10,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 255, 0, 0.1)",
  },
  infoText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  reconnectText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default StakingScreen;
