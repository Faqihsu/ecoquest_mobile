import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { Connection } from "@solana/web3.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./shared/api/queryClient";
import { AppWalletProvider } from "./components/AppWalletProvider";
import { TransactionToastProvider } from "./components/TransactionToastProvider";
import { QuestProvider } from "./contexts/QuestContext";
import { useWallet } from "./contexts/WalletContext";
import { Colors } from "./utils/colors";
import PremiumTabBar from "./components/PremiumTabBar";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { useAccountWatcher } from "./hooks/useAccountWatcher";
import { useWalletGuard } from "./hooks/useWalletGuard";
import { setupRewardNotifications, addNotificationResponseListener } from "./services/rewardNotifications";

// Screens
import * as SplashScreen from "expo-splash-screen";
import CustomSplashScreen from "./screens/SplashScreen";

// Prevent native splash screen from autohiding
SplashScreen.preventAutoHideAsync();
import WalletConnectScreen from "./screens/WalletConnectScreen";
import DashboardScreen from "./screens/DashboardScreen";
import EcoQuestsScreen from "./screens/EcoQuestsScreen";
import MapScreen from "./screens/MapScreen";
import StakingScreen from "./screens/StakingScreen";
import PvPArenaScreen from "./screens/PvPArenaScreen";
import GovernanceScreen from "./screens/GovernanceScreen";
import ProfileScreen from "./screens/ProfileScreen";

// New Screens (for Dead Button fix)
import QuestDetailScreen from "./screens/QuestDetailScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import SettingsScreen from "./screens/SettingsScreen";
import AdminDashboardScreen from "./screens/AdminDashboardScreen";
import SwapScreen from "./screens/SwapScreen";
import GuardianPoolScreen from "./screens/GuardianPoolScreen";
import CreateQuestScreen from "./screens/CreateQuestScreen";
import EcoBadgeGalleryScreen from "./screens/EcoBadgeGalleryScreen";

// Hackathon UX components
import DevnetBadge from "./components/DevnetBadge";
import AirdropButton from "./components/AirdropButton";
import ErrorBoundary from "./components/ErrorBoundary";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Wrapper so QuestProvider receives live walletAddress from WalletContext
function QuestProviderWrapper({ children }: { children: React.ReactNode }) {
  const { publicKeyBase58 } = useWallet();
  return <QuestProvider walletAddress={publicKeyBase58}>{children}</QuestProvider>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Quests"    component={EcoQuestsScreen} />
      <Tab.Screen name="Map"       component={MapScreen} />
      <Tab.Screen name="Staking"   component={StakingScreen} />
      <Tab.Screen name="Profile"   component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AppNavigation() {
  // Read real connected state from WalletContext (via AppWalletProvider → WalletProvider)
  const { connected, publicKeyBase58 } = useWallet();
  const [isReady, setIsReady] = useState(false);

  // Layer 1: WebSocket program log events → React Query invalidation
  useRealtimeSync(publicKeyBase58 ?? null);

  // Layer 2: Direct account change subscriptions → React Query cache set (instant)
  useAccountWatcher(publicKeyBase58 ?? null);

  // Layer 3: Wallet disconnect guard — AppState listener + session validation
  useWalletGuard();

  useEffect(() => {
    async function prepare() {
      try {
        // Setup local push notifications (channel + handler)
        await setupRewardNotifications();

        // 🔒 HACKATHON: Verify Devnet connectivity on startup
        try {
          const devnetConn = new Connection("https://api.devnet.solana.com", "confirmed");
          const epoch = await devnetConn.getEpochInfo();
          console.log("[Devnet] ✅ Connected — epoch:", epoch.epoch, "slot:", epoch.absoluteSlot);
        } catch (devnetErr) {
          console.warn("[Devnet] ⚠️ Connection check failed:", devnetErr);
          // Non-blocking: app still loads, on-chain features will retry
        }

        // Artificially delay for 0.5s as requested by user ("tampilan profesional")
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.warn(e);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: Colors.accent.primary,
          background: Colors.background.dark,
          card: Colors.background.card,
          text: Colors.text.primary,
          border: Colors.border.medium,
          notification: Colors.accent.primary,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!connected ? (
          <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {/* Registered Routes for Navigation */}
            <Stack.Screen name="QuestDetail" component={QuestDetailScreen} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="Settings"    component={SettingsScreen} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="Swap"        component={SwapScreen} />
            <Stack.Screen name="GuardianPool" component={GuardianPoolScreen} />
            <Stack.Screen name="CreateQuest"  component={CreateQuestScreen} />
            <Stack.Screen name="PvP"          component={PvPArenaScreen} />
            <Stack.Screen name="Governance"   component={GovernanceScreen} />
            <Stack.Screen name="EcoBadgeGallery" component={EcoBadgeGalleryScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppWalletProvider>
          <QuestProviderWrapper>
            <TransactionToastProvider>
              <View style={{ flex: 1 }}>
                <AppNavigation />
                {/* 🔒 HACKATHON: Persistent Devnet indicator + low-balance airdrop */}
                <DevnetBadge />
                <AirdropButton />
              </View>
            </TransactionToastProvider>
          </QuestProviderWrapper>
        </AppWalletProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
