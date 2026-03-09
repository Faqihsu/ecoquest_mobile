// ─────────────────────────────────────────────────────────────────────────────
// AR Camera Overlay
//
// Renders on top of the CameraView to show real-time GPS coordinates,
// quest target location, and distance to target.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

interface QuestLocation {
  latitude: number;
  longitude: number;
  radius: number;
  name: string;
}

interface ARCameraOverlayProps {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  questLocation?: QuestLocation | null;
  questId: string;
}

/** Haversine distance in meters between two coordinates */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ARCameraOverlay({
  latitude,
  longitude,
  accuracy,
  questLocation,
  questId,
}: ARCameraOverlayProps) {
  // Blinking cursor for "live" feel
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();

    // Scan line sweep
    Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();
  }, []);

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  // Compute distance and status
  let distanceText = '---';
  let inRange = false;
  if (latitude && longitude && questLocation) {
    const dist = haversineDistance(latitude, longitude, questLocation.latitude, questLocation.longitude);
    distanceText = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
    inRange = dist <= questLocation.radius;
  }

  const gpsColor = accuracy && accuracy <= 20 ? '#00ff00' : accuracy && accuracy <= 50 ? '#ffaa00' : '#ff4444';
  const rangeColor = inRange ? '#00ff00' : '#ffaa00';

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Scan line */}
      <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanTranslateY }] }]} />

      {/* Top bar — GPS coordinates */}
      <View style={styles.topBar}>
        <View style={styles.topBarRow}>
          <Animated.View style={[styles.liveDot, { opacity: blinkAnim, backgroundColor: gpsColor }]} />
          <Text style={[styles.gpsLabel, { color: gpsColor }]}>GPS LIVE</Text>
        </View>
        <View style={styles.coordRow}>
          <Text style={styles.coordText}>
            {latitude ? `${latitude.toFixed(6)}°` : '---'}
            {'  '}
            {longitude ? `${longitude.toFixed(6)}°` : '---'}
          </Text>
        </View>
        {accuracy && (
          <Text style={[styles.accuracyText, { color: gpsColor }]}>
            ±{accuracy.toFixed(0)} m accuracy
          </Text>
        )}
      </View>

      {/* Quest info — right corner */}
      <View style={styles.questBadge}>
        <Text style={styles.questLabel}>QUEST #{questId}</Text>
        {questLocation && (
          <Text style={styles.questName}>{questLocation.name}</Text>
        )}
      </View>

      {/* Distance ring indicator */}
      {questLocation && (
        <View style={styles.ringContainer}>
          <View style={[styles.ring, { borderColor: `${rangeColor}40` }]}>
            <View style={[styles.ringInner, { borderColor: `${rangeColor}80` }]}>
              <View style={[styles.ringDot, { backgroundColor: rangeColor }]} />
            </View>
          </View>
        </View>
      )}

      {/* Bottom status bar */}
      <View style={styles.bottomBar}>
        {questLocation && (
          <View style={styles.statusChip}>
            <Text style={[styles.statusText, { color: rangeColor }]}>
              {inRange ? '✅ IN RANGE' : `📍 ${distanceText} TO TARGET`}
            </Text>
          </View>
        )}
        <View style={styles.statusChip}>
          <Text style={styles.timestampText}>
            {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        </View>
      </View>

      {/* Corner bracket decorations */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
    top: '50%',
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    gap: 2,
  },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  gpsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  coordRow: { marginTop: 3 },
  coordText: { color: '#fff', fontSize: 11, fontFamily: 'monospace' },
  accuracyText: { fontSize: 10, marginTop: 2 },

  questBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    alignItems: 'flex-end',
  },
  questLabel: { color: '#00ff00', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  questName: { color: '#fff', fontSize: 11, marginTop: 2, maxWidth: 110, textAlign: 'right' },

  ringContainer: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringDot: { width: 12, height: 12, borderRadius: 6 },

  bottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusChip: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.2)',
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  timestampText: { color: '#aaa', fontSize: 11, fontFamily: 'monospace' },

  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#00ff00',
  },
  cornerTL: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 },
});

export default ARCameraOverlay;
