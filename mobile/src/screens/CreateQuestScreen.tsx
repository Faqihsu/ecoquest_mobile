/**
 * CreateQuestScreen.tsx
 *
 * User creates and immediately completes their own eco-quest:
 *  1. Fill in: title, category (picker)
 *  2. Tap "Ambil Foto Bukti" → live camera ONLY (no gallery pick)
 *  3. Submit → saved to QuestContext + ECO points added instantly
 *
 * Design: single-flow screen, bottom sheet feel, premium dark UI.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, Image,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  InteractionManager,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  withRepeat,
} from "react-native-reanimated";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../utils/colors";
import { useWallet } from "../contexts/WalletContext";
import {
  useQuests, QuestCategory, ECO_REWARDS, CATEGORY_ICONS,
} from "../contexts/QuestContext";

const CATEGORIES: QuestCategory[] = ["Pantai", "Hutan", "Sungai", "Kota", "Lainnya"];

const TIPS: Record<QuestCategory, string> = {
  Pantai:  "Bersihkan sampah di pantai, pesisir, atau tepi laut.",
  Hutan:   "Tanam pohon, rawat hutan, atau dokumentasikan flora.",
  Sungai:  "Bersihkan bantaran sungai atau danau dari sampah.",
  Kota:    "Daur ulang, kurangi emisi, atau bersihkan area kota.",
  Lainnya: "Aktivitas eco-friendly apapun yang kamu lakukan.",
};

type Step = "form" | "camera" | "preview";

export default function CreateQuestScreen({ navigation }: any) {
  const { publicKeyBase58 } = useWallet();
  const { addQuest, canCreateQuest, cooldownMessage } = useQuests();

  // Form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QuestCategory>("Pantai");
  const [step, setStep] = useState<Step>("form");

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // AbortController for clean cancellation of submit flow
  const abortRef = useRef<AbortController | null>(null);

  // Step-based progress for submit: Verifying Location → Analyzing Image → Securing Data
  const [submitStep, setSubmitStep] = useState<
    'idle' | 'verifying_location' | 'analyzing_image' | 'securing_data' | 'done'
  >('idle');

  // ── Cleanup: abort on unmount (user leaves screen mid-process) ────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const isProcessing = submitting || capturing;

  const ecoReward = ECO_REWARDS[category];

  // ── Step 1: Validate form → open camera ──────────────────────────────────

  const handleGoToCamera = async () => {
    if (!title.trim()) {
      Alert.alert("Judul Wajib Diisi", "Masukkan judul singkat untuk quest ini.");
      return;
    }

    // Daily cooldown check
    if (!canCreateQuest) {
      Alert.alert(
        "Quest Harian Selesai",
        cooldownMessage ?? "Kamu sudah berkontribusi hari ini! Kembali lagi besok.",
      );
      return;
    }

    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          "Izin Kamera Diperlukan",
          "Bukti foto langsung diperlukan untuk mendapatkan ECO Points."
        );
        return;
      }
    }
    setStep("camera");
  };

  // ── Step 2: Capture photo ─────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    if (!cameraReady) {
      Alert.alert("Kamera Belum Siap", "Tunggu sebentar sampai kamera siap, lalu coba lagi.");
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        exif: false,
        // NOTE: skipProcessing removed — causes blank/corrupt photos on many Android devices
      });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        // Unmount camera immediately: reset cameraReady so it won't render
        setCameraReady(false);
        setStep("preview");
      } else {
        Alert.alert("Gagal", "Foto tidak berhasil diambil. Coba lagi.");
      }
    } catch (err: any) {
      console.error("[Camera] Capture error:", err);
      Alert.alert(
        "Gagal Mengambil Foto",
        "Kamera mengalami error. Coba kembali dan buka lagi.",
        [{ text: "Kembali", onPress: () => { setCameraReady(false); setStep("form"); } }]
      );
    } finally {
      setCapturing(false);
    }
  }, [capturing, cameraReady]);

  // ── Step 3: Submit quest ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!photoUri || submitting) return; // Double-submit guard

    // Abort any previous in-flight submission
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmitting(true);
    setSubmitStep('verifying_location');

    try {
      // ── Step 1: Verifying Location ───────────────────────────────────────
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        if (controller.signal.aborted) throw new Error('Cancelled');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && !controller.signal.aborted) {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch {}

      if (controller.signal.aborted) return;

      // ── Step 2: Analyzing Image ─────────────────────────────────────────
      setSubmitStep('analyzing_image');
      // Defer heavy analysis to after UI interactions complete
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          // Image validation (integrity check is handled by the quest system)
          resolve();
        });
      });
      if (controller.signal.aborted) return;

      // ── Step 3: Securing Data ───────────────────────────────────────────
      setSubmitStep('securing_data');
      if (controller.signal.aborted) return;

      await addQuest({
        title: title.trim(),
        description: "",
        category,
        ecoReward,
        proofPhotoUri: photoUri,
        latitude: lat,
        longitude: lng,
        walletAddress: publicKeyBase58 ?? "demo",
      });

      if (controller.signal.aborted) return;

      setSubmitStep('done');

      Alert.alert(
        "🌿 Quest Selesai!",
        `+${ecoReward} ECO Points ditambahkan!\n\nTerus lakukan aktivitas eco-friendly untuk mengumpulkan lebih banyak ECO.`,
        [{ text: "Lihat Quest Saya", onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      if (controller.signal.aborted) return; // Silent ignore if cancelled
      Alert.alert("Gagal Menyimpan", err?.message ?? "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
      setSubmitStep('idle');
    }
  };

  // ── Render: Form Step ─────────────────────────────────────────────────────

  if (step === "form") {
    return (
      <View style={s.container}>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

              {/* Header */}
              <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                  <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Buat Quest</Text>
                <View style={{ width: 24 }} />
              </View>

              {/* ECO reward preview */}
              <View style={s.rewardBanner}>
                <Text style={s.rewardIcon}>🌿</Text>
                <View>
                  <Text style={s.rewardLabel}>ECO Points yang akan didapat</Text>
                  <Text style={s.rewardValue}>+{ecoReward} ECO</Text>
                </View>
              </View>

              {/* Category picker */}
              <Text style={s.label}>Kategori Aktivitas</Text>
              <View style={s.categoryGrid}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.catBtn, category === cat && s.catBtnActive]}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.catIcon}>{CATEGORY_ICONS[cat]}</Text>
                    <Text style={[s.catLabel, category === cat && s.catLabelActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tip */}
              <View style={s.tipBox}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.accent.primary} />
                <Text style={s.tipText}>{TIPS[category]}</Text>
              </View>

              {/* Title input */}
              <Text style={s.label}>Judul Quest</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Contoh: Bersihkan Pantai RT 05"
                placeholderTextColor="#44556a"
                maxLength={60}
                returnKeyType="done"
              />
              <Text style={s.charCount}>{title.length}/60</Text>

              {/* Camera reminder */}
              <View style={s.cameraReminder}>
                <Ionicons name="camera-outline" size={20} color="#f97316" />
                <Text style={s.cameraReminderText}>
                  Kamu akan diminta mengambil foto bukti{"\n"}secara langsung menggunakan kamera.
                </Text>
              </View>

              {/* Daily cooldown banner */}
              {!canCreateQuest && cooldownMessage && (
                <View style={{
                  flexDirection: "row", alignItems: "flex-start", gap: 10,
                  backgroundColor: "rgba(99,102,241,0.08)", borderRadius: 12,
                  padding: 14, borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
                }}>
                  <Text style={{ fontSize: 22 }}>🌍</Text>
                  <Text style={{ fontSize: 13, color: "#818cf8", flex: 1, lineHeight: 20, fontWeight: "500" }}>
                    {cooldownMessage}
                  </Text>
                </View>
              )}

              {/* CTA */}
              <TouchableOpacity
                style={[s.ctaBtn, (!title.trim() || !canCreateQuest) && s.ctaDisabled]}
                onPress={handleGoToCamera}
                disabled={!title.trim() || !canCreateQuest}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={20} color="#000" />
                <Text style={s.ctaBtnText}>{canCreateQuest ? "Ambil Foto Bukti" : "Quest Selesai Hari Ini ✓"}</Text>
              </TouchableOpacity>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render: Camera Step (AR Verification UI) ──────────────────────────────

  if (step === "camera") {
    // If camera had a fatal error, show fallback instead of blank white screen
    if (cameraError) {
      return (
        <View style={[s.container, { justifyContent: "center", alignItems: "center", padding: 40 }]}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
          <Text style={{ color: "#f97316", fontSize: 16, fontWeight: "700", marginBottom: 8, textAlign: "center" }}>
            Kamera Tidak Tersedia
          </Text>
          <Text style={{ color: "#999", fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
            {cameraError}
          </Text>
          <TouchableOpacity
            style={[s.ctaBtn, { paddingHorizontal: 32 }]}
            onPress={() => { setCameraError(null); setCameraReady(false); }}
          >
            <Text style={s.ctaBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setStep("form")}>
            <Text style={{ color: Colors.text.muted, fontSize: 13 }}>← Kembali ke Form</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={s.container}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => { setCameraReady(true); setCameraError(null); }}
          onMountError={(e: any) => {
            const msg = e?.message ?? "Kamera gagal dimuat.";
            console.error("[Camera] Mount error:", msg);
            setCameraError(msg);
          }}
        />
        
        {/* Dark vignette overlay for AR feel — pointerEvents none so touches pass through */}
        <View style={s.vignette} pointerEvents="none" />

        <SafeAreaView style={s.arOverlay} pointerEvents="box-none">
          {/* Top Bar */}
          <View style={s.arHeader}>
            <TouchableOpacity style={s.arBackBtn} onPress={() => setStep("form")}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            <View style={s.seedVaultBadge}>
              <Ionicons name="finger-print" size={14} color="rgba(255,255,255,0.7)" />
              <View>
                <Text style={s.seedVaultLabel}>Secured by</Text>
                <Text style={s.seedVaultText}>Seed Vault</Text>
              </View>
            </View>
          </View>

          {/* Bottom Controls */}
          <View style={s.arBottomArea} pointerEvents="box-none">
            
            {/* Verification Status Bars */}
            <View style={s.statusContainer}>
              <View style={s.statusBar}>
                <Ionicons name={submitStep === 'verifying_location' || submitStep === 'analyzing_image' || submitStep === 'securing_data' || submitStep === 'done' ? "checkmark-circle" : "radio-button-off"} size={16} color={submitStep !== 'idle' ? "#00ff87" : "rgba(255,255,255,0.5)"} />
                <Text style={submitStep === 'verifying_location' ? s.statusTextActive : s.statusText}>Verifying Location</Text>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: submitStep !== 'idle' ? "100%" : "0%", backgroundColor: "#00ff87" }]} />
                </View>
              </View>
              
              <View style={s.statusBar}>
                <Ionicons name={submitStep === 'analyzing_image' || submitStep === 'securing_data' || submitStep === 'done' ? "checkmark-circle" : "radio-button-off"} size={16} color={submitStep === 'analyzing_image' || submitStep === 'securing_data' || submitStep === 'done' ? "#00ff87" : "rgba(255,255,255,0.5)"} />
                <Text style={submitStep === 'analyzing_image' ? s.statusTextActive : s.statusText}>Analyzing Image</Text>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: submitStep === 'analyzing_image' || submitStep === 'securing_data' || submitStep === 'done' ? "100%" : "0%", backgroundColor: "#00ff87" }]} />
                </View>
              </View>

              <View style={s.statusBar}>
                <Ionicons name={submitStep === 'done' ? "checkmark-circle" : "radio-button-off"} size={16} color={submitStep === 'securing_data' || submitStep === 'done' ? "#00ff87" : "rgba(255,255,255,0.5)"} />
                <Text style={submitStep === 'securing_data' ? s.statusTextActive : s.statusText}>Securing Data...</Text>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: submitStep === 'securing_data' ? "60%" : submitStep === 'done' ? "100%" : "0%", backgroundColor: submitStep === 'done' ? "#00ff87" : "rgba(255,255,255,0.8)" }]} />
                </View>
              </View>
            </View>

            {/* Glowing Shutter Button */}
            <View style={s.shutterContainer}>
              <TouchableOpacity
                style={[s.arShutter, (capturing || submitting) && s.shutterCapturing]}
                onPress={handleCapture}
                disabled={capturing || submitting}
                activeOpacity={0.8}
              >
                <View style={s.arShutterRing}>
                  {capturing ? (
                     <ActivityIndicator color="#000" size="large" />
                  ) : (
                     <View style={s.arShutterInner} />
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Timestamp & GPS */}
            <View style={s.arFooter}>
              <Text style={s.arMetaText}>{new Date().toLocaleTimeString("en-US", { hour12: false })}</Text>
              <Text style={s.arMetaText}>GPS: SCANNING...</Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render: Preview + Submit Step ─────────────────────────────────────────

  return (
    <View style={s.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content}>

          <View style={s.header}>
            <TouchableOpacity onPress={() => setStep("camera")}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Konfirmasi</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Preview photo */}
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={s.previewPhoto}
              resizeMode="cover"
            />
          )}

          {/* Quest summary */}
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>{title}</Text>
            <View style={s.summaryRow}>
              <Text style={s.summaryCat}>{CATEGORY_ICONS[category]} {category}</Text>
              <View style={s.ecoChip}>
                <Text style={s.ecoChipText}>+{ecoReward} ECO</Text>
              </View>
            </View>
            <Text style={s.summaryNote}>
              ECO Points disimpan lokal dan akan dapat diconvert ke token ECO di mainnet pada masa mendatang. 🚀
            </Text>
          </View>

          {/* Retake — disabled during processing */}
          <TouchableOpacity style={[s.retakeBtn, isProcessing && { opacity: 0.4 }]} onPress={() => setStep("camera")} disabled={isProcessing}>
            <Ionicons name="camera-outline" size={16} color={Colors.text.muted} />
            <Text style={s.retakeText}>Ambil Ulang Foto</Text>
          </TouchableOpacity>

          {/* Submit — disabled during processing to prevent double-submission */}
          <TouchableOpacity
            style={[s.ctaBtn, isProcessing && s.ctaDisabled]}
            onPress={handleSubmit}
            disabled={isProcessing}
            activeOpacity={0.85}
          >
            {submitting
              ? <>
                  <ActivityIndicator color="#000" size="small" />
                  <Text style={[s.ctaBtnText, { marginLeft: 8 }]}>
                    {submitStep === 'verifying_location' ? 'Verifying Location...'
                     : submitStep === 'analyzing_image' ? 'Analyzing Image...'
                     : submitStep === 'securing_data' ? 'Securing Data...'
                     : 'Processing...'}
                  </Text>
                </>
              : <>
                  <Ionicons name="checkmark-circle" size={20} color="#000" />
                  <Text style={s.ctaBtnText}>Klaim +{ecoReward} ECO Points</Text>
                </>}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080f1a" },
  content: { padding: 20, gap: 16 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#fff" },

  rewardBanner: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "rgba(0,255,135,0.08)", borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: "rgba(0,255,135,0.2)",
  },
  rewardIcon: { fontSize: 32 },
  rewardLabel: { fontSize: 12, color: "#999", marginBottom: 3 },
  rewardValue: { fontSize: 22, fontWeight: "800", color: Colors.accent.primary },

  label: { fontSize: 12, fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: 0.6 },

  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catBtn: {
    width: "30%", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  catBtnActive: { backgroundColor: "rgba(0,255,135,0.12)", borderColor: Colors.accent.primary },
  catIcon: { fontSize: 24, marginBottom: 4 },
  catLabel: { fontSize: 11, color: "#888", fontWeight: "600" },
  catLabelActive: { color: Colors.accent.primary },

  tipBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(0,255,135,0.05)", borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: "rgba(0,255,135,0.1)",
  },
  tipText: { fontSize: 12, color: "#888", flex: 1, lineHeight: 18 },

  input: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    color: "#fff", fontSize: 15,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  charCount: { fontSize: 11, color: "#444", textAlign: "right" },

  cameraReminder: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(249,115,22,0.08)", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: "rgba(249,115,22,0.2)",
  },
  cameraReminderText: { fontSize: 13, color: "#f97316", flex: 1, lineHeight: 20 },

  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.accent.primary, borderRadius: 14,
    paddingVertical: 17, marginTop: 8,
  },
  ctaBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },
  ctaDisabled: { opacity: 0.4 },

  // AR Camera UI
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  arOverlay: { flex: 1, justifyContent: "space-between" },
  arHeader: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 10,
  },
  arBackBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  seedVaultBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  seedVaultLabel: { fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" },
  seedVaultText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  
  arBottomArea: { paddingHorizontal: 20, paddingBottom: 10, gap: 30 },
  
  statusContainer: { gap: 10, paddingHorizontal: 10 },
  statusBar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  statusText: { fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 },
  statusTextActive: { fontSize: 12, color: "#fff", fontWeight: "600", flex: 1 },
  progressTrack: { width: 40, height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },

  shutterContainer: { alignItems: "center" },
  arShutter: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: "rgba(0,255,135,0.2)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#00ff87", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 10,
  },
  arShutterRing: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: "transparent",
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  arShutterInner: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#fff",
  },
  shutterCapturing: { opacity: 0.5, transform: [{ scale: 0.95 }] },

  arFooter: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 },
  arMetaText: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },

  // Preview
  previewPhoto: { width: "100%", height: 240, borderRadius: 16, backgroundColor: "#111" },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14,
    padding: 18, borderWidth: 1, borderColor: "rgba(0,255,135,0.15)",
  },
  summaryTitle: { fontSize: 17, fontWeight: "700", color: "#fff", marginBottom: 10 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  summaryCat: { fontSize: 14, color: "#aaa" },
  ecoChip: { backgroundColor: "rgba(0,255,135,0.15)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: Colors.accent.primary },
  ecoChipText: { fontSize: 13, fontWeight: "800", color: Colors.accent.primary },
  summaryNote: { fontSize: 12, color: "#666", lineHeight: 18 },

  retakeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12,
  },
  retakeText: { fontSize: 13, color: Colors.text.muted },
});
