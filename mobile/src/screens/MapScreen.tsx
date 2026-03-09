/**
 * MapScreen.tsx
 *
 * GPS-first global map experience:
 *  1. Shows loading state while GPS resolves
 *  2. Map centers on user's REAL location (no hardcoded city)
 *  3. Procedural discovery quests generated around user (2km radius)
 *  4. User-created quests with GPS coordinates shown as pins
 *  5. Fallback: manual city picker if GPS unavailable after 10s
 */

import React, {
  useEffect, useRef, useState, useCallback, useMemo,
} from "react";
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Dimensions, Modal,
  Platform, Pressable,
} from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, Easing,
} from "react-native-reanimated";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useWallet } from "../contexts/WalletContext";
import { Colors } from "../utils/colors";
import { useQuests, UserQuest, CATEGORY_ICONS, QuestCategory } from "../contexts/QuestContext";

const { height: SCREEN_H } = Dimensions.get("window");

const GPS_TIMEOUT_MS = 10_000; // 10 seconds before offering manual pick

// ─── Procedural Quest Generation ─────────────────────────────────────────────
// Generates discovery quest markers around the user's location within 2km.

interface ProceduralQuest {
  id: string;
  title: string;
  category: QuestCategory;
  latitude: number;
  longitude: number;
  ecoReward: number;
}

const PROCEDURAL_TEMPLATES: { title: string; category: QuestCategory; ecoReward: number }[] = [
  { title: "🏖️ Bersihkan Area Pantai", category: "Pantai", ecoReward: 80 },
  { title: "🌳 Tanam Pohon di Taman", category: "Hutan", ecoReward: 100 },
  { title: "🌊 Bersihkan Bantaran Sungai", category: "Sungai", ecoReward: 90 },
  { title: "♻️ Daur Ulang Sampah Kota", category: "Kota", ecoReward: 60 },
  { title: "🌿 Eco Patrol Area Sekitar", category: "Lainnya", ecoReward: 50 },
  { title: "🏖️ Dokumentasi Polusi Pesisir", category: "Pantai", ecoReward: 70 },
  { title: "🌳 Rawat Area Hutan Kota", category: "Hutan", ecoReward: 90 },
  { title: "♻️ Bersihkan Zona Publik", category: "Kota", ecoReward: 65 },
];

/**
 * Generate random coordinate offsets within a radius (meters).
 * Uses simple equirectangular projection — accurate enough for <5km.
 */
function generateNearbyQuests(
  centerLat: number,
  centerLng: number,
  radiusMeters: number = 2000,
  count: number = 8,
): ProceduralQuest[] {
  // 1° latitude ≈ 111,320 m
  const latOffset = radiusMeters / 111320;
  // 1° longitude ≈ 111,320 * cos(lat) m
  const lngOffset = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));

  // Deterministic seed from center coordinates (stable across renders)
  const seed = Math.abs(Math.floor(centerLat * 10000) + Math.floor(centerLng * 10000));

  return PROCEDURAL_TEMPLATES.slice(0, count).map((template, i) => {
    // Pseudo-random but deterministic per location
    const angle = ((seed + i * 137) % 360) * (Math.PI / 180);
    const dist = 0.3 + ((seed + i * 73) % 70) / 100; // 0.3 – 1.0 of radius

    return {
      id: `pq-${i}-${seed}`,
      title: template.title,
      category: template.category,
      latitude: centerLat + Math.cos(angle) * latOffset * dist,
      longitude: centerLng + Math.sin(angle) * lngOffset * dist,
      ecoReward: template.ecoReward,
    };
  });
}

// ─── Haversine Distance (meters) ─────────────────────────────────────────────

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
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

// ─── Global city presets for manual pick ──────────────────────────────────────
const CITY_PRESETS = [
  // 🇮🇩 Indonesia
  { label: "📍 Jakarta",        lat: -6.2000, lng: 106.8167 },
  { label: "📍 Bandung",        lat: -6.9175, lng: 107.6191 },
  { label: "📍 Surabaya",       lat: -7.2575, lng: 112.7521 },
  { label: "📍 Bali / Denpasar",lat: -8.6500, lng: 115.2167 },
  { label: "📍 Yogyakarta",     lat: -7.7956, lng: 110.3695 },
  { label: "📍 Medan",          lat:  3.5952, lng:  98.6722 },
  // 🌏 Asia
  { label: "📍 Singapore",      lat:  1.3521, lng: 103.8198 },
  { label: "📍 Kuala Lumpur",   lat:  3.1390, lng: 101.6869 },
  { label: "📍 Bangkok",        lat: 13.7563, lng: 100.5018 },
  { label: "📍 Tokyo",          lat: 35.6762, lng: 139.6503 },
  { label: "📍 Seoul",          lat: 37.5665, lng: 126.9780 },
  { label: "📍 Mumbai",         lat: 19.0760, lng:  72.8777 },
  { label: "📍 Dubai",          lat: 25.2048, lng:  55.2708 },
  // 🌍 Europe & Africa
  { label: "📍 London",         lat: 51.5074, lng:  -0.1278 },
  { label: "📍 Berlin",         lat: 52.5200, lng:  13.4050 },
  { label: "📍 Paris",          lat: 48.8566, lng:   2.3522 },
  { label: "📍 Nairobi",        lat: -1.2921, lng:  36.8219 },
  { label: "📍 Cape Town",      lat:-33.9249, lng:  18.4241 },
  // 🌎 Americas
  { label: "📍 New York",       lat: 40.7128, lng: -74.0060 },
  { label: "📍 San Francisco",  lat: 37.7749, lng:-122.4194 },
  { label: "📍 São Paulo",      lat:-23.5505, lng: -46.6333 },
  // 🌏 Oceania
  { label: "📍 Sydney",         lat:-33.8688, lng: 151.2093 },
];

function pinColor(quest: UserQuest | ProceduralQuest): string {
  const colorMap: Record<string, string> = {
    Pantai: Colors.accent.primary,
    Hutan: "#10d981",
    Sungai: "#3b82f6",
    Kota: Colors.secondary.orange,
    Lainnya: "#8b5cf6",
  };
  return colorMap[quest.category] ?? Colors.accent.primary;
}

// ─── Pulsing marker for manual location ──────────────────────────────────────
function PulseMarker() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1,   { duration: 900, easing: Easing.in(Easing.ease) }),
      ), -1, false,
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 900 }), withTiming(0.6, { duration: 900 })),
      -1, false,
    );
  }, []);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
      {/* pulsing ring */}
      <Animated.View style={[StyleSheet.absoluteFill, {
        borderRadius: 16,
        borderWidth: 2,
        borderColor: Colors.accent.primary,
      }, ring]} />
      {/* solid dot */}
      <View style={{
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: Colors.accent.primary,
        borderWidth: 2, borderColor: "#fff",
      }} />
    </View>
  );
}

// ─── Manual Location Picker Modal ────────────────────────────────────────────
function ManualPickerModal({
  visible,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  onSelect: (lat: number, lng: number, label: string) => void;
  onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={modal.overlay} onPress={onDismiss}>
        <Pressable style={modal.sheet} onPress={() => {}}>
          <View style={modal.handle} />
          <Text style={modal.title}>📍 Pilih Lokasi</Text>
          <Text style={modal.subtitle}>
            Pilih kota terdekatmu, atau tekan lama di peta untuk set lokasi manual di mana saja.
          </Text>
          <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
            {CITY_PRESETS.map((city) => (
              <TouchableOpacity
                key={city.label}
                style={modal.cityRow}
                activeOpacity={0.75}
                onPress={() => onSelect(city.lat, city.lng, city.label)}
              >
                <Text style={modal.cityText}>{city.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.text.muted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={modal.cancelBtn} onPress={onDismiss}>
            <Text style={modal.cancelText}>Tutup</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Quest Card (bottom sheet — user's own quests) ───────────────────────────
function QuestCard({
  quest, isSelected, onPress,
}: { quest: UserQuest; isSelected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardIconWrap}>
        <Text style={styles.cardIcon}>{CATEGORY_ICONS[quest.category]}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{quest.title}</Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardCat}>{quest.category}</Text>
          {quest.latitude && (
            <><Feather name="map-pin" size={11} color={Colors.text.muted} style={{ marginLeft: 6 }} />
            <Text style={styles.cardDist}> GPS ✓</Text></>
          )}
        </View>
        <Text style={styles.cardReward}>🌿 +{quest.ecoReward} ECO</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Safe MapView wrapper — catches native crashes ──────────────────────────
import { Component, ErrorInfo } from "react";

interface MapErrorState { hasError: boolean; error: string }

class MapErrorBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, MapErrorState> {
  state: MapErrorState = { hasError: false, error: "" };
  static getDerivedStateFromError(err: Error) { return { hasError: true, error: err.message }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error("[MapErrorBoundary]", err, info); }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── Fallback UI when MapView crashes ────────────────────────────────────────
function MapFallback() {
  const navigation = useNavigation<any>();
  const { connected } = useWallet();
  const { userQuests } = useQuests();

  return (
    <SafeAreaView style={[styles.container, { paddingTop: 20 }]}> 
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>📍 Eco Map</Text>
            <Text style={styles.headerSub}>{userQuests.length} quest tersedia</Text>
          </View>
        </View>

        <View style={{
          backgroundColor: "rgba(249,115,22,0.12)", borderRadius: 12,
          padding: 14, borderWidth: 1, borderColor: "rgba(249,115,22,0.3)",
        }}>
          <Text style={{ color: "#f97316", fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
            ⚠️ Google Maps tidak tersedia
          </Text>
          <Text style={{ color: "#999", fontSize: 12, lineHeight: 18 }}>
            Peta tidak bisa ditampilkan. Pastikan Google Maps API Key sudah dikonfigurasi di app.json.
            Quest tetap bisa dibuat dan dikelola dari daftar di bawah.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.createFab}
          onPress={() => {
            if (!connected) {
              Alert.alert("Wallet Diperlukan", "Hubungkan wallet Solana untuk membuat quest.");
              return;
            }
            navigation.navigate("CreateQuest");
          }}
        >
          <Ionicons name="add" size={16} color="#000" />
          <Text style={styles.createFabText}>Buat Quest</Text>
        </TouchableOpacity>

        <ScrollView style={{ marginTop: 8 }}>
          {userQuests.map((quest) => (
            <TouchableOpacity
              key={quest.id}
              style={[styles.card, { width: "100%", marginBottom: 10 }]}
              onPress={() => navigation.navigate("QuestDetail", { questId: quest.id })}
            >
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIcon}>{CATEGORY_ICONS[quest.category]}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>{quest.title}</Text>
                <Text style={styles.cardReward}>🌿 +{quest.ecoReward} ECO</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ─── Exported Screen ─────────────────────────────────────────────────────────
function MapScreenInner() {
  const navigation = useNavigation<any>();
  const { connected } = useWallet();
  const { userQuests } = useQuests();
  // Only show quests that have GPS coordinates
  const geoQuests = userQuests.filter((q) => q.latitude !== null && q.longitude !== null);
  const mapRef = useRef<MapView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Location state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>(""); // e.g. "📍 Jakarta Pusat"
  const [isManualLocation, setIsManualLocation] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [gpsSearching, setGpsSearching] = useState(true); // Start true — we're searching on mount
  const [mapReady, setMapReady] = useState(false);

  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  // ── Procedural quests — generated around user location ──────────────────
  const proceduralQuests = useMemo<ProceduralQuest[]>(() => {
    if (!userLocation) return [];
    return generateNearbyQuests(userLocation.latitude, userLocation.longitude, 2000, 8);
  }, [userLocation]);

  // ── GPS — get real position, no hardcoded default ──────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationGranted(false);
        setGpsSearching(false);
        setShowManualPicker(true); // Permission denied → offer manual pick
        return;
      }
      setLocationGranted(true);
      setGpsSearching(true);

      // Start 10-second timeout
      gpsTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        setGpsSearching(false);
        setShowManualPicker(true); // GPS didn't respond in 10s → manual picker
      }, GPS_TIMEOUT_MS);

      // Try to get position
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        // GPS responded — cancel timeout
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setGpsSearching(false);

        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);
        setIsManualLocation(false);
        setLocationLabel("📡 GPS Aktif");

        // Animate map to user's real position
        mapRef.current?.animateToRegion(
          { ...coords, latitudeDelta: 0.06, longitudeDelta: 0.06 },
          800,
        );

        // Keep tracking live position
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
          (l) => {
            if (!cancelled) {
              setUserLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude });
            }
          },
        );
      } catch {
        if (cancelled) return;
        if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
        setGpsSearching(false);
        setShowManualPicker(true);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    };
  }, []);

  // ── Manual location selection ───────────────────────────────────────────────
  const handleManualSelect = useCallback((lat: number, lng: number, label: string) => {
    setShowManualPicker(false);
    setUserLocation({ latitude: lat, longitude: lng });
    setIsManualLocation(true);
    setLocationLabel(label);
    setGpsSearching(false);

    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
      700,
    );
  }, []);

  // ── Navigate to CreateQuestScreen ──────────────────────────────────────────
  const handleCreateQuest = useCallback(() => {
    if (!connected) {
      Alert.alert("Wallet Diperlukan", "Hubungkan wallet Solana untuk membuat quest.");
      return;
    }
    navigation.navigate("CreateQuest");
  }, [connected, navigation]);

  // ── Tap marker → select + scroll card ──────────────────────────────────────
  const handleMarkerPress = useCallback((quest: UserQuest, index: number) => {
    setSelectedQuestId(quest.id);
    scrollRef.current?.scrollTo({ x: index * 232, animated: true });
    if (quest.latitude) {
      mapRef.current?.animateToRegion(
        { latitude: quest.latitude - 0.015, longitude: quest.longitude!, latitudeDelta: 0.06, longitudeDelta: 0.06 },
        500,
      );
    }
  }, []);

  // ── Tap procedural marker → navigate to CreateQuest ────────────────────────
  const handleProceduralPress = useCallback((quest: ProceduralQuest) => {
    if (!connected) {
      Alert.alert("Wallet Diperlukan", "Hubungkan wallet Solana untuk start quest.");
      return;
    }
    Alert.alert(
      quest.title,
      `🌿 +${quest.ecoReward} ECO Points\n\nPergi ke lokasi ini dan buat quest untuk mendapatkan reward!`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Buat Quest", onPress: () => navigation.navigate("CreateQuest") },
      ],
    );
  }, [connected, navigation]);

  // ── Re-center ───────────────────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion(
      { ...userLocation, latitudeDelta: 0.06, longitudeDelta: 0.06 },
      600,
    );
  }, [userLocation]);

  // ── Compute dynamic initial region from user location ──────────────────────
  const initialRegion: Region | undefined = userLocation
    ? {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      }
    : undefined;

  // ────────────────────────────────────────────────────────────────────────────
  // Show loading while GPS resolves. Map renders when we have a location.
  // ────────────────────────────────────────────────────────────────────────────

  // If no location yet and still searching, show loading state
  if (!userLocation && gpsSearching) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
        <Text style={{ color: Colors.text.muted, marginTop: 16, fontSize: 14 }}>
          📡 Mencari lokasi GPS...
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12 }}
          onPress={() => { setGpsSearching(false); setShowManualPicker(true); }}
        >
          <Text style={{ color: Colors.accent.primary, fontSize: 13, fontWeight: "600" }}>Pilih Lokasi Manual</Text>
        </TouchableOpacity>
        <ManualPickerModal
          visible={showManualPicker}
          onSelect={handleManualSelect}
          onDismiss={() => setShowManualPicker(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Map renders with user's real location ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={undefined}
        initialRegion={initialRegion}
        showsUserLocation={locationGranted === true && !isManualLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        mapType="standard"
        loadingEnabled={false}
        moveOnMarkerPress={false}
        onMapReady={() => setMapReady(true)}
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          handleManualSelect(latitude, longitude, `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }}
      >
        {/* User quest markers (only those with GPS coordinates) */}
        {geoQuests.map((quest, i) => (
          <Marker
            key={quest.id}
            coordinate={{ latitude: quest.latitude!, longitude: quest.longitude! }}
            onPress={() => handleMarkerPress(quest, i)}
            tracksViewChanges={false}
          >
            <View style={[
              styles.pin,
              { borderColor: pinColor(quest) },
              selectedQuestId === quest.id && styles.pinSelected,
            ]}>
              <Text style={styles.pinEmoji}>{CATEGORY_ICONS[quest.category]}</Text>
            </View>
          </Marker>
        ))}

        {/* Procedural discovery quest markers — within 2km of user */}
        {proceduralQuests.map((pq) => (
          <Marker
            key={pq.id}
            coordinate={{ latitude: pq.latitude, longitude: pq.longitude }}
            onPress={() => handleProceduralPress(pq)}
            tracksViewChanges={false}
            opacity={0.85}
          >
            <View style={[styles.pin, styles.pinProcedural, { borderColor: pinColor(pq) }]}>
              <Text style={styles.pinEmoji}>{CATEGORY_ICONS[pq.category]}</Text>
            </View>
          </Marker>
        ))}

        {/* Manual location marker — pulsing custom dot */}
        {isManualLocation && userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PulseMarker />
          </Marker>
        )}
      </MapView>

      {/* ── Top overlay ── */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>📍 Eco Map</Text>
            <Text style={styles.headerSub}>{geoQuests.length + proceduralQuests.length} quest di peta</Text>
          </View>

          {/* GPS status indicator */}
          <View style={styles.gpsStatus}>
            {gpsSearching ? (
              <>
                <ActivityIndicator size="small" color={Colors.accent.primary} style={{ marginRight: 5 }} />
                <Text style={styles.gpsSearchText}>GPS…</Text>
              </>
            ) : isManualLocation ? (
              <TouchableOpacity
                style={styles.manualBadge}
                onPress={() => setShowManualPicker(true)}
              >
                <Ionicons name="location-outline" size={12} color="#f97316" />
                <Text style={styles.manualBadgeText}> Manual</Text>
              </TouchableOpacity>
            ) : locationGranted === false ? (
              <TouchableOpacity
                style={styles.noBadge}
                onPress={() => setShowManualPicker(true)}
              >
                <Ionicons name="location-outline" size={12} color="#f97316" />
                <Text style={styles.noBadgeText}> GPS Off</Text>
              </TouchableOpacity>
            ) : locationGranted === true ? (
              <View style={styles.gpsBadge}>
                <View style={styles.gpsGreenDot} />
                <Text style={styles.gpsBadgeText}>GPS Aktif</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Wallet warning */}
        {!connected && (
          <View style={styles.walletBanner}>
            <Ionicons name="wallet-outline" size={13} color={Colors.secondary.orange} />
            <Text style={styles.walletBannerText}>{" "}Connect wallet untuk start quest & mint NFT</Text>
          </View>
        )}

        {/* Manual location label */}
        {isManualLocation && locationLabel && (
          <TouchableOpacity style={styles.manualLabel} onPress={() => setShowManualPicker(true)}>
            <Text style={styles.manualLabelText}>{locationLabel} · Ketuk untuk ganti</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* ── Recenter + Manual pick buttons ── */}
      <View style={styles.sideButtons} pointerEvents="box-none">
        {userLocation && (
          <TouchableOpacity style={styles.sideBtn} onPress={handleRecenter}>
            <Ionicons name="locate" size={20} color={Colors.accent.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.sideBtn} onPress={() => setShowManualPicker(true)}>
          <Ionicons name="map-outline" size={20} color={Colors.accent.primary} />
        </TouchableOpacity>
      </View>

        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetLabel}>Quest Saya</Text>
            <TouchableOpacity style={styles.createFab} onPress={handleCreateQuest}>
              <Ionicons name="add" size={16} color="#000" />
              <Text style={styles.createFabText}>Buat Quest</Text>
            </TouchableOpacity>
          </View>
          {userQuests.length === 0 ? (
            <TouchableOpacity style={styles.emptySheet} onPress={handleCreateQuest}>
              <Text style={styles.emptySheetText}>🌿 Buat quest pertama untuk melihatnya di peta!</Text>
            </TouchableOpacity>
          ) : (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardList}
            >
              {userQuests.map((quest, i) => (
                <QuestCard
                  key={quest.id}
                  quest={quest}
                  isSelected={selectedQuestId === quest.id}
                  onPress={() => handleMarkerPress(quest, i)}
                />
              ))}
            </ScrollView>
          )}
        </View>

      {/* ── Manual Location Picker Modal ── */}
      <ManualPickerModal
        visible={showManualPicker}
        onSelect={handleManualSelect}
        onDismiss={() => setShowManualPicker(false)}
      />
    </View>
  );
}

// ─── Default export wraps the map in an error boundary ───────────────────────
export default function MapScreen() {
  return (
    <MapErrorBoundary fallback={<MapFallback />}>
      <MapScreenInner />
    </MapErrorBoundary>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.dark },
  map: { flex: 1 },

  // Pin markers
  pin: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(10,20,30,0.92)",
    borderWidth: 2,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 6,
  },
  pinSelected: { width: 52, height: 52, borderRadius: 26, borderWidth: 3 },
  pinProcedural: {
    borderStyle: "dashed",
    backgroundColor: "rgba(10,20,30,0.7)",
  },
  pinEmoji: { fontSize: 22 },

  // Top overlay
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0 },
  header: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: "rgba(10,18,32,0.90)",
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.15)",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: Colors.text.primary },
  headerSub: { fontSize: 12, color: Colors.text.muted, marginTop: 2 },

  // GPS status
  gpsStatus: { flexDirection: "row", alignItems: "center" },
  gpsSearchText: { fontSize: 11, color: Colors.accent.primary, fontWeight: "600" },
  gpsBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,255,135,0.12)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(0,255,135,0.25)",
  },
  gpsGreenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent.primary, marginRight: 5 },
  gpsBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.accent.primary },
  noBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(249,115,22,0.15)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.3)",
  },
  noBadgeText: { fontSize: 11, fontWeight: "700", color: "#f97316" },
  manualBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(249,115,22,0.15)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.3)",
  },
  manualBadgeText: { fontSize: 11, fontWeight: "700", color: "#f97316" },

  // Wallet, manual label banners
  walletBanner: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: "row", alignItems: "center",
    borderLeftWidth: 3, borderLeftColor: Colors.secondary.orange,
  },
  walletBannerText: { color: Colors.secondary.orange, fontSize: 12, fontWeight: "500" },
  manualLabel: {
    marginHorizontal: 16, marginTop: 6,
    backgroundColor: "rgba(249,115,22,0.10)", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.25)",
  },
  manualLabelText: { fontSize: 11, color: "#f97316", fontWeight: "600" },

  // Side buttons (recenter + manual pick)
  sideButtons: {
    position: "absolute", right: 16,
    bottom: SCREEN_H * 0.38 + 12,
    gap: 10,
  },
  sideBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(10,18,32,0.92)",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.3)",
    alignItems: "center", justifyContent: "center",
    elevation: 5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 6,
  },

  // Bottom sheet
  bottomSheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.36,
    backgroundColor: "rgba(10,18,32,0.96)",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10,
    borderTopWidth: 1, borderColor: "rgba(0,255,135,0.15)",
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2, alignSelf: "center", marginBottom: 10,
  },
  sheetLabel: {
    fontSize: 13, fontWeight: "700", color: Colors.text.muted,
    paddingHorizontal: 20, marginBottom: 10,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  cardList: { paddingHorizontal: 16, gap: 12, paddingBottom: 20 },

  // Quest cards
  card: {
    width: 220, backgroundColor: Colors.background.card,
    borderRadius: 16, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: Colors.border.medium,
  },
  cardSelected: { borderColor: Colors.accent.primary, backgroundColor: "rgba(0,255,135,0.07)" },
  cardIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.background.darker,
    alignItems: "center", justifyContent: "center",
  },
  cardIcon: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: Colors.text.primary, marginBottom: 5 },
  cardRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  diffBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  diffText: { fontSize: 10, fontWeight: "700" },
  cardDist: { fontSize: 11, color: Colors.text.muted },
  cardCat: { fontSize: 11, color: "#888", fontWeight: "600" },
  cardReward: { fontSize: 11, color: Colors.accent.primary, fontWeight: "600" },

  // Bottom sheet header + create button
  sheetHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 10,
  },
  createFab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.accent.primary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  createFabText: { fontSize: 12, fontWeight: "800", color: "#000" },

  // Empty state in bottom sheet
  emptySheet: {
    marginHorizontal: 20, paddingVertical: 18,
    backgroundColor: "rgba(0,255,135,0.05)", borderRadius: 14,
    alignItems: "center",
    borderWidth: 1, borderColor: "rgba(0,255,135,0.15)", borderStyle: "dashed",
  },
  emptySheetText: { fontSize: 13, color: "#666", textAlign: "center" },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0b1120",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === "ios" ? 40 : 28,
  },
  handle: {
    width: 40, height: 4, backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2, alignSelf: "center", marginBottom: 18,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#999", marginBottom: 18, lineHeight: 18 },
  cityRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  cityText: { fontSize: 15, color: "#e2e8f0", fontWeight: "500" },
  cancelBtn: {
    marginTop: 18, paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, alignItems: "center",
  },
  cancelText: { color: "#64748b", fontWeight: "600", fontSize: 13 },
});
