/**
 * DevnetBadge.tsx
 *
 * Persistent "⚡ Devnet Mode" badge in the top-right corner.
 * Overlays all screens so hackathon judges always know this is a testing environment.
 * Uses pointerEvents="none" to not block touch interactions.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function DevnetBadge() {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.badge}>
        <Text style={styles.text}>⚡ Devnet Mode</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 52,
    right: 12,
    zIndex: 9999,
  },
  badge: {
    backgroundColor: "rgba(0, 255, 135, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(0, 255, 135, 0.4)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    color: "#00ff87",
    letterSpacing: 0.5,
  },
});
