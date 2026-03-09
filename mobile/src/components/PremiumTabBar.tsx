/**
 * PremiumTabBar.tsx
 * Custom bottom tab bar — glassmorphism + haptic feedback + animated indicator
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Theme as T } from "../utils/theme";

const { width: W } = Dimensions.get("window");

interface TabConfig {
  label: string;
  icon: string;
  activeIcon: string;
}

function getTabConfig(routeName: string): TabConfig {
  switch (routeName) {
    case "Dashboard":  return { label: "Home",    icon: "🏠", activeIcon: "🏠" };
    case "Quests":     return { label: "Quests",  icon: "🌿", activeIcon: "🌱" };
    case "Map":        return { label: "Map",     icon: "🗺️", activeIcon: "🗺️" }; // Special central button
    case "Staking":    return { label: "Stake",   icon: "💎", activeIcon: "💎" };
    case "Profile":    return { label: "Profile", icon: "👤", activeIcon: "👤" };
    default:           return { label: routeName, icon: "●",  activeIcon: "●"  };
  }
}

// ── Animated Tab Item ──────────────────────────────────────────────────────

function TabItem({
  tab,
  isActive,
  onPress,
}: {
  tab: TabConfig;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isActive ? 1 : 0.5);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0.5, { duration: 200 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePress = () => {
    // Micro-interaction: quick scale bounce
    scale.value = withSpring(0.85, { damping: 6, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.tabItem}
      onPress={handlePress}
      activeOpacity={1}
    >
      <Animated.View style={[styles.tabInner, animStyle]}>
        {tab.label === "Camera" ? (
          <View style={styles.cameraBtnWrap}>
            <View style={styles.cameraBtn}>
              <Ionicons name="camera" size={26} color="#000" />
            </View>
            <Text style={styles.cameraLabel}>Camera</Text>
          </View>
        ) : (
          <View style={styles.tabInnerWrap}>
            <Text style={styles.tabIcon}>
              {isActive ? tab.activeIcon : tab.icon}
            </Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.tabActiveDot} />}
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Main PremiumTabBar ─────────────────────────────────────────────────────

interface PremiumTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export default function PremiumTabBar({
  state,
  descriptors,
  navigation,
}: PremiumTabBarProps) {
  const insets = useSafeAreaInsets();
  const numTabs = state.routes.length;
  const TAB_W = W / numTabs;
  const indicatorX = useSharedValue(state.index * TAB_W);

  useEffect(() => {
    indicatorX.value = withSpring(state.index * TAB_W, {
      damping: 18,
      stiffness: 200,
      mass: 0.8,
    });
  }, [state.index, TAB_W]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value + TAB_W / 2 - 20 }],
  }));

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 8 }]}>
      {/* Sliding neon indicator */}
      <Animated.View style={[styles.indicator, indicatorStyle]} />

      {/* Tabs — derived from actual navigator routes, always in sync */}
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const tab = getTabConfig(route.name);

        return (
          <TabItem
            key={route.key}
            tab={tab}
            isActive={isFocused}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: T.color.bg.glass,
    borderTopWidth: 1,
    borderTopColor: T.color.border.green,
    paddingTop: 10,
    // Glassmorphism via backdrop — on Android we simulate with dark bg
    ...Platform.select({
      ios: {
        backdropFilter: "blur(20px)",
      },
    }),
  },
  indicator: {
    position: "absolute",
    top: 0,
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: T.color.green.neon,
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
  },
  tabInner: {
    alignItems: "center",
    gap: 2,
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: T.color.text.muted,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: T.color.green.neon,
  },
  tabInnerWrap: {
    alignItems: "center",
    gap: 2,
  },
  tabActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.color.green.neon,
    marginTop: 1,
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  cameraBtnWrap: {
    alignItems: "center",
    marginTop: -28, // Pop out of the bar
    gap: 4,
  },
  cameraBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: T.color.green.neon,
    justifyContent: "center",
    alignItems: "center",
    // Glowing shadow
    shadowColor: T.color.green.neon,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 4,
    borderColor: "#0b1120", // Blend with background
  },
  cameraLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: T.color.text.muted,
    letterSpacing: 0.3,
  },
});
