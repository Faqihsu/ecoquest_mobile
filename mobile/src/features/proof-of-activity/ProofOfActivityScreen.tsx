import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useProofOfActivity } from './useProofOfActivity';
import { useCameraPermissions, SECURE_CAMERA_PROPS } from './cameraCapture';
import { ProofState } from './types';
import { ARCameraOverlay } from '../../components/ARCameraOverlay';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProofOfActivityScreenProps {
  questId: string;
  userPublicKey: any; // PublicKey from @solana/web3.js
  signTransaction: ((tx: any) => Promise<any>) | null;
  onSuccess?: (signature: string, metadataUri: string) => void;
  onCancel?: () => void;
}

// ── Step Indicator ────────────────────────────────────────────────────────────

const STEPS: { key: ProofState; label: string; icon: string }[] = [
  { key: 'gps_check', label: 'GPS', icon: '🛰️' },
  { key: 'camera', label: 'Photo', icon: '📷' },
  { key: 'uploading', label: 'Upload', icon: '☁️' },
  { key: 'submitting', label: 'Chain', icon: '⛓️' },
  { key: 'done', label: 'Done', icon: '✅' },
];

const STATE_ORDER: ProofState[] = ['idle', 'gps_check', 'camera', 'uploading', 'submitting', 'done'];

function StepIndicator({ currentState }: { currentState: ProofState }) {
  const currentIndex = STATE_ORDER.indexOf(currentState);

  return (
    <View style={styles.stepContainer}>
      {STEPS.map((step, idx) => {
        const stepIndex = STATE_ORDER.indexOf(step.key);
        const isCompleted = currentIndex > stepIndex;
        const isActive = currentIndex === stepIndex;

        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isCompleted && styles.stepCompleted,
                  isActive && styles.stepActive,
                ]}
              >
                <Text style={styles.stepIcon}>{isCompleted ? '✓' : step.icon}</Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCompleted && styles.stepLabelCompleted,
                ]}
              >
                {step.label}
              </Text>
            </View>
            {idx < STEPS.length - 1 && (
              <View
                style={[
                  styles.stepConnector,
                  currentIndex > stepIndex && styles.stepConnectorCompleted,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Pulsing Indicator ─────────────────────────────────────────────────────────

function PulsingDot() {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View style={[styles.pulsingDot, { transform: [{ scale: anim }] }]} />
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function ProofOfActivityScreen({
  questId,
  userPublicKey,
  signTransaction,
  onSuccess,
  onCancel,
}: ProofOfActivityScreenProps) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Live GPS for AR overlay
  const [liveGps, setLiveGps] = useState<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
  }>({ latitude: null, longitude: null, accuracy: null });

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1 },
        (loc) => {
          setLiveGps({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
          });
        }
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  const {
    state,
    statusMessage,
    startProof,
    cameraRef,
    error,
    errorType,
    result,
    signature,
    reset,
  } = useProofOfActivity(questId, userPublicKey, signTransaction);

  // ── Derived state ─────────────────────────────────────────────────────────
  // Processing = any state where an async operation is running
  const isProcessing = ['gps_check', 'uploading', 'submitting'].includes(state);
  const showCamera = state === 'camera' || state === 'idle';
  const showSuccess = state === 'done';
  const showError = state === 'error' && errorType !== 'anti_cheat';

  // ── Abort all operations when leaving the screen ──────────────────────────
  useEffect(() => {
    return () => {
      // On unmount: abort any in-flight GPS/camera/upload/submit work
      reset();
    };
  }, [reset]);

  // Request camera permission on mount
  useEffect(() => {
    if (!cameraPermission?.granted) {
      requestCameraPermission();
    }
  }, []);

  // Notify parent on success
  useEffect(() => {
    if (state === 'done' && signature && result) {
      onSuccess?.(signature, result.upload.metadataUri);
    }
  }, [state, signature, result]);

  // Show anti-cheat alert
  useEffect(() => {
    if (state === 'error' && errorType === 'anti_cheat') {
      Alert.alert(
        '🚨 Cheat Detected',
        error ?? 'GPS validation failed.',
        [
          { text: 'Try Again', onPress: reset },
          { text: 'Cancel', onPress: handleCancel, style: 'cancel' },
        ]
      );
    }
  }, [state, errorType]);

  // ── Cancel handler: abort first, then notify parent ───────────────────────
  const handleCancel = () => {
    reset(); // Aborts all in-flight operations via AbortController
    onCancel?.();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0a0a1a', '#0d1f0d', '#0a0a1a']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleCancel}
          style={styles.cancelBtn}
          disabled={isProcessing}
        >
          <Text style={[styles.cancelText, isProcessing && { opacity: 0.4 }]}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Proof of Activity</Text>
        <Text style={styles.questLabel}>Quest #{questId}</Text>
      </View>

      {/* Step Indicator */}
      <StepIndicator currentState={state} />

      {/* Camera View */}
      {showCamera && cameraPermission?.granted && (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef as any}
            style={styles.camera}
            {...SECURE_CAMERA_PROPS}
          />
          {/* AR Overlay — coordinates + distance */}
          <ARCameraOverlay
            latitude={liveGps.latitude}
            longitude={liveGps.longitude}
            accuracy={liveGps.accuracy}
            questId={questId}
          />
          <Text style={styles.cameraHint}>Point camera at your activity location</Text>
        </View>
      )}

      {/* Loading State — Verifying Location / Analyzing Image / Securing Data */}
      {isProcessing && (
        <View style={styles.loadingContainer}>
          <PulsingDot />
          <Text style={styles.statusText}>{statusMessage}</Text>
          <TouchableOpacity
            style={{ marginTop: 20, paddingVertical: 10, paddingHorizontal: 20 }}
            onPress={handleCancel}
          >
            <Text style={{ color: '#9ca3af', fontSize: 14 }}>Cancel Process</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Success State */}
      {showSuccess && (
        <ScrollView style={styles.resultContainer} contentContainerStyle={styles.resultContent}>
          <Text style={styles.successIcon}>🌿</Text>
          <Text style={styles.successTitle}>Quest Proof Submitted!</Text>
          <Text style={styles.successSubtitle}>Your eco-activity is now permanently on-chain.</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Transaction</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {signature?.slice(0, 20)}...
            </Text>
          </View>

          {result && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Metadata URI</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {result.upload.metadataUri}
              </Text>
              <Text style={styles.infoProvider}>via {result.upload.provider.toUpperCase()}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={onCancel}>
            <Text style={styles.primaryBtnText}>Back to Quests</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Generic Error State */}
      {showError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>
            {errorType === 'upload' ? 'Upload Failed' : 'Submission Failed'}
          </Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reset}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Capture Button — disabled during processing to prevent double-submission */}
      {showCamera && (
        <View style={styles.captureArea}>
          <TouchableOpacity
            style={[styles.captureBtn, isProcessing && { opacity: 0.4 }]}
            onPress={startProof}
            activeOpacity={0.8}
            disabled={isProcessing}
          >
            <LinearGradient
              colors={['#22c55e', '#16a34a']}
              style={styles.captureBtnGradient}
            >
              <Text style={styles.captureBtnText}>🌿 Capture Proof</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.captureHint}>
            GPS will be validated automatically before capture
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },

  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelBtn: { padding: 8 },
  cancelText: { color: '#9ca3af', fontSize: 18 },
  title: { color: '#f0fdf4', fontSize: 18, fontWeight: '700' },
  questLabel: { color: '#22c55e', fontSize: 14, fontWeight: '600' },

  // Step indicator
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  stepCompleted: { borderColor: '#16a34a', backgroundColor: '#14532d' },
  stepIcon: { fontSize: 16 },
  stepLabel: { color: '#6b7280', fontSize: 11, fontWeight: '500' },
  stepLabelActive: { color: '#22c55e' },
  stepLabelCompleted: { color: '#4ade80' },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#1f2937',
    marginBottom: 16,
    marginHorizontal: 4,
  },
  stepConnectorCompleted: { backgroundColor: '#16a34a' },

  // Camera
  cameraContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: { flex: 1 },
  cameraHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#22c55e',
  },
  cornerTL: { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 56, left: 16, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 56, right: 16, borderBottomWidth: 3, borderRightWidth: 3 },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  pulsingDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#22c55e',
  },
  statusText: {
    color: '#d1fae5',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Success
  resultContainer: { flex: 1 },
  resultContent: {
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  successIcon: { fontSize: 64, marginBottom: 8 },
  successTitle: { color: '#f0fdf4', fontSize: 24, fontWeight: '800' },
  successSubtitle: { color: '#86efac', fontSize: 15, textAlign: 'center' },
  infoCard: {
    width: '100%',
    backgroundColor: '#0f2d0f',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#166534',
    gap: 4,
  },
  infoLabel: { color: '#4ade80', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { color: '#d1fae5', fontSize: 13, fontFamily: 'monospace' },
  infoProvider: { color: '#6b7280', fontSize: 11 },
  primaryBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorIcon: { fontSize: 48 },
  errorTitle: { color: '#fca5a5', fontSize: 20, fontWeight: '700' },
  errorMessage: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 8,
  },
  retryBtnText: { color: '#f9fafb', fontSize: 15, fontWeight: '600' },

  // Capture button
  captureArea: {
    padding: 20,
    gap: 8,
    alignItems: 'center',
  },
  captureBtn: { width: width - 40, borderRadius: 16, overflow: 'hidden' },
  captureBtnGradient: { paddingVertical: 18, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  captureHint: { color: '#6b7280', fontSize: 12, textAlign: 'center' },
});
