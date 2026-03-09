// ─────────────────────────────────────────────────────────────────────────────
// GPS Anti-Spoofing Module
//
// Security layers:
//   1. expo-location `mocked` flag  — catches most Fake GPS apps on Android
//   2. Speed sanity check           — >300 km/h is physically impossible on foot
//   3. Altitude sanity check        — outside Earth's surface range
//   4. Multi-sample jitter analysis — real GPS has natural noise; perfect
//      readings with 0 variance are a hallmark of mocked locations
//   5. Accuracy threshold           — mock providers often report suspiciously
//      perfect accuracy (0-1 m) or absurdly bad accuracy (9999 m)
// ─────────────────────────────────────────────────────────────────────────────

import * as Location from 'expo-location';
import { AntiCheatResult, GpsReading } from './types';

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_REALISTIC_SPEED_MS = 83.3;    // 300 km/h in m/s
const MAX_ALTITUDE_M = 8849;            // Top of Everest
const MIN_ALTITUDE_M = -500;            // Dead Sea + buffer
const SAMPLE_COUNT = 3;
const SAMPLE_INTERVAL_MS = 800;
const MIN_JITTER_DEGREES = 0.000001;    // ~0.1m — real GPS always has this
const SUSPICIOUS_ACCURACY_M = 0.5;     // Unrealistically precise
const MAX_ACCEPTABLE_ACCURACY_M = 100; // Too inaccurate to trust

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGpsReading(loc: Location.LocationObject): GpsReading {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
    mocked: (loc as any).mocked === true,
    timestamp: loc.timestamp,
  };
}

/**
 * Collect multiple GPS samples to detect suspiciously perfect readings.
 * Real GPS always has natural jitter; mock providers often return identical
 * coordinates across samples.
 */
async function collectSamples(): Promise<GpsReading[]> {
  const samples: GpsReading[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    samples.push(toGpsReading(loc));

    if (i < SAMPLE_COUNT - 1) {
      await sleep(SAMPLE_INTERVAL_MS);
    }
  }

  return samples;
}

/**
 * Check if all samples have suspiciously identical coordinates (zero jitter).
 * Legitimate GPS readings drift slightly between samples.
 */
function hasZeroJitter(samples: GpsReading[]): boolean {
  if (samples.length < 2) return false;

  const latValues = samples.map((s) => s.latitude);
  const lonValues = samples.map((s) => s.longitude);

  const latRange = Math.max(...latValues) - Math.min(...latValues);
  const lonRange = Math.max(...lonValues) - Math.min(...lonValues);

  // If all readings are pixel-perfect identical → suspicious
  return latRange < MIN_JITTER_DEGREES && lonRange < MIN_JITTER_DEGREES;
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Full GPS anti-spoofing validation pipeline.
 *
 * @returns AntiCheatResult — `passed: true` with validated reading, or
 *          `passed: false` with human-readable reason.
 *
 * @example
 * const result = await validateGpsAntiSpoof();
 * if (!result.passed) {
 *   Alert.alert('Cheat Detected', result.reason);
 *   return;
 * }
 * const gps = result.reading!;
 */
export async function validateGpsAntiSpoof(): Promise<AntiCheatResult> {
  // ── Step 1: Request permissions ──────────────────────────────────────────
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { passed: false, reason: 'Location permission denied.' };
  }

  // ── Step 2: Collect multi-sample readings ────────────────────────────────
  let samples: GpsReading[];
  try {
    samples = await collectSamples();
  } catch (err) {
    return { passed: false, reason: 'Failed to acquire GPS signal. Please try outdoors.' };
  }

  const primary = samples[0];

  // ── Step 3a: expo-location mocked flag (Android) ─────────────────────────
  if (primary.mocked) {
    return {
      passed: false,
      reason: 'Mock/Fake GPS detected. Disable any location spoofing apps and try again.',
    };
  }

  // ── Step 3b: Mock Provider Package Detection (Android) ───────────────────
  // Some fake GPS apps bypass the `mocked` flag but still expose themselves
  // through the provider name. Check all samples for mock provider hints.
  for (const sample of samples) {
    const rawSample = sample as any;
    const provider = rawSample.provider ?? rawSample.extras?.provider ?? '';
    if (typeof provider === 'string' && provider.length > 0) {
      const lowerProvider = provider.toLowerCase();
      const MOCK_PROVIDERS = ['mock', 'fake', 'gps_provider', 'fused_mock', 'test'];
      if (MOCK_PROVIDERS.some((mp) => lowerProvider.includes(mp))) {
        return {
          passed: false,
          reason: `Fake GPS provider detected ("${provider}"). Please disable mock location apps.`,
        };
      }
    }
  }

  // ── Step 3c: Timestamp Freshness Check ───────────────────────────────────
  // Ensure GPS reading is from the last 30 seconds — blocks stale/replayed
  // location data that could be injected programmatically.
  const GPS_MAX_AGE_MS = 30_000;
  const now = Date.now();
  const gpsAge = now - primary.timestamp;
  if (gpsAge > GPS_MAX_AGE_MS || gpsAge < -5000) {
    // Negative age means GPS claims to be from the future — definite spoof
    return {
      passed: false,
      reason: `GPS timestamp is stale or invalid (age: ${Math.round(gpsAge / 1000)}s). Please retry.`,
    };
  }

  // ── Step 4: Speed sanity check ───────────────────────────────────────────
  if (primary.speed !== null && primary.speed > MAX_REALISTIC_SPEED_MS) {
    return {
      passed: false,
      reason: `Unrealistic speed detected (${(primary.speed * 3.6).toFixed(0)} km/h). GPS spoofing suspected.`,
    };
  }

  // ── Step 5: Altitude sanity check ───────────────────────────────────────
  if (primary.altitude !== null) {
    if (primary.altitude > MAX_ALTITUDE_M || primary.altitude < MIN_ALTITUDE_M) {
      return {
        passed: false,
        reason: `Impossible altitude detected (${primary.altitude.toFixed(0)}m). GPS spoofing suspected.`,
      };
    }
  }

  // ── Step 6: Accuracy sanity check ───────────────────────────────────────
  if (primary.accuracy !== null) {
    if (primary.accuracy < SUSPICIOUS_ACCURACY_M) {
      return {
        passed: false,
        reason: `Suspiciously perfect GPS accuracy (${primary.accuracy.toFixed(2)}m). Mock location suspected.`,
      };
    }
    if (primary.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
      return {
        passed: false,
        reason: `GPS signal too weak (accuracy: ${primary.accuracy.toFixed(0)}m). Please move to an open area.`,
      };
    }
  }

  // ── Step 7: Zero-jitter multi-sample check ───────────────────────────────
  if (hasZeroJitter(samples)) {
    return {
      passed: false,
      reason: 'GPS readings show zero variance across samples — this is characteristic of a mocked location.',
    };
  }

  // ── All checks passed ────────────────────────────────────────────────────
  return { passed: true, reading: primary };
}
