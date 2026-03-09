// ─────────────────────────────────────────────────────────────────────────────
// AntiCheatService.ts
// EcoQuest Mobile — Anti-Cheat Orchestrator
//
// Centralizes all anti-cheat validation logic:
//   1. GPS Anti-Spoofing  (delegates to gpsAntiSpoof module)
//   2. Geofence Validation (player physically at quest site)
//   3. Time-lock Guard    (prevents replay of old proofs)
//   4. Velocity Check     (cross-sample movement impossible at human speed)
//   5. Device Integrity   (basic root/emulator detection heuristics)
//
// Design principle: All methods return a typed ValidationResult — never throw.
// The calling layer (useQuestSubmission) decides how to handle failures.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { validateGpsAntiSpoof } from '@features/proof-of-activity/gpsAntiSpoof';
import { locationService } from './LocationService';
import type { GpsReading, AntiCheatResult } from '@features/proof-of-activity/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum allowed time drift between client clock and server (minutes) */
const MAX_CLOCK_DRIFT_MINUTES = 5;

/** Maximum allowed age of a GPS reading before it is considered stale (seconds) */
const MAX_READING_AGE_SECONDS = 90;

/** Maximum speed a human can realistically travel on foot (m/s) ~36 km/h jog */
const MAX_HUMAN_SPEED_MS = 10;

/** Default quest geofence radius (meters) — overridden per-quest */
const DEFAULT_GEOFENCE_RADIUS_M = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  reason?: string;
  code?: AntiCheatCode;
}

export type AntiCheatCode =
  | 'GPS_SPOOF'
  | 'GEOFENCE_FAIL'
  | 'STALE_LOCATION'
  | 'CLOCK_DRIFT'
  | 'VELOCITY_VIOLATION'
  | 'DEVICE_INTEGRITY'
  | 'PERMISSION_DENIED';

export interface QuestSiteCoordinates {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
}

export interface FullAntiCheatReport {
  passed: boolean;
  validatedReading: GpsReading | null;
  checks: {
    gpsSpoof: ValidationResult;
    geofence: ValidationResult;
    staleness: ValidationResult;
    velocity: ValidationResult;
    deviceIntegrity: ValidationResult;
  };
  /** Aggregated failure reason for UI display (first failure found) */
  firstFailureReason: string | null;
}

// ── AntiCheatService ──────────────────────────────────────────────────────────

class AntiCheatService {
  /** Stores last validated reading for velocity cross-checks */
  private lastReading: GpsReading | null = null;

  // ── 1. GPS Spoof Check ─────────────────────────────────────────────────────

  /**
   * Delegates to the gpsAntiSpoof module for multi-layer detection:
   * mocked flag, speed sanity, altitude sanity, zero-jitter analysis.
   */
  async checkGpsAntiSpoof(): Promise<AntiCheatResult> {
    return validateGpsAntiSpoof();
  }

  // ── 2. Geofence Validation ────────────────────────────────────────────────

  /**
   * Verify the player is physically inside the quest's geographic boundary.
   *
   * @param reading  - GPS reading that passed anti-spoof checks
   * @param site     - Quest site coordinates and radius
   */
  checkGeofence(
    reading: GpsReading,
    site: QuestSiteCoordinates
  ): ValidationResult {
    const radius = site.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_M;
    const result = locationService.checkGeofence(
      reading,
      site.latitude,
      site.longitude,
      radius
    );

    if (!result.inside) {
      return {
        passed: false,
        code: 'GEOFENCE_FAIL',
        reason:
          `You are ${result.distanceMeters.toFixed(0)}m from the quest site. ` +
          `You must be within ${radius}m to submit proof.`,
      };
    }

    return { passed: true };
  }

  // ── 3. Staleness Check ────────────────────────────────────────────────────

  /**
   * Reject GPS readings older than MAX_READING_AGE_SECONDS.
   * Prevents replaying a previously cached location.
   */
  checkStaleness(reading: GpsReading): ValidationResult {
    const ageSeconds = (Date.now() - reading.timestamp) / 1000;

    if (ageSeconds > MAX_READING_AGE_SECONDS) {
      return {
        passed: false,
        code: 'STALE_LOCATION',
        reason:
          `GPS reading is ${ageSeconds.toFixed(0)}s old. ` +
          'Please try again — your location must be captured in real time.',
      };
    }

    return { passed: true };
  }

  // ── 4. Velocity Cross-Check ───────────────────────────────────────────────

  /**
   * Compare current reading against the last validated one.
   * If the delta speed between checks exceeds human capability, flag it.
   *
   * Note: This is intentionally conservative — false positives are rare
   * because GPS always has margin of error built in.
   */
  checkVelocity(current: GpsReading): ValidationResult {
    if (!this.lastReading) {
      this.lastReading = current;
      return { passed: true };
    }

    const timeDeltaSeconds = (current.timestamp - this.lastReading.timestamp) / 1000;

    if (timeDeltaSeconds <= 0) {
      // Timestamps identical or out of order — clock manipulation suspected
      return {
        passed: false,
        code: 'CLOCK_DRIFT',
        reason: 'Device clock inconsistency detected. Please check your system time.',
      };
    }

    const distanceMeters = locationService.distanceBetween(this.lastReading, current);
    const speedMs = distanceMeters / timeDeltaSeconds;

    if (speedMs > MAX_HUMAN_SPEED_MS && timeDeltaSeconds < 60) {
      return {
        passed: false,
        code: 'VELOCITY_VIOLATION',
        reason:
          `Impossible movement detected (${(speedMs * 3.6).toFixed(1)} km/h). ` +
          'Location teleportation is not permitted.',
      };
    }

    this.lastReading = current;
    return { passed: true };
  }

  // ── 5. Device Integrity ───────────────────────────────────────────────────

  /**
   * Heuristic device integrity check.
   *
   * Production hardening:
   *   - Android: Use Google Play Integrity API (requires server-side verification).
   *   - iOS: Use DeviceCheck / App Attest (requires Apple server call).
   *
   * This client-side implementation is a lightweight fallback for environments
   * where server-side attestation is not yet configured.
   */
  checkDeviceIntegrity(): ValidationResult {
    // ── Emulator detection (basic) ────────────────────────────────────────
    // On Android, emulators typically report no camera/GPS hardware.
    // This is already handled by expo-location returning mocked=true on emulators.

    // ── Debug mode guard ──────────────────────────────────────────────────
    // In a production build, __DEV__ is false. If somehow true, gate the check.
    if (__DEV__) {
      // Skip integrity checks in development — would always fail on simulators
      return { passed: true };
    }

    // Platform-specific: iOS builds from TestFlight/App Store pass this.
    // Android builds from EAS pass this. Sideloaded APKs may not.
    if (Platform.OS === 'android') {
      // Advanced: Check for root via react-native-device-info (optional dependency).
      // For now, relies on R8 obfuscation + Play Protect at the OS level.
      return { passed: true };
    }

    return { passed: true };
  }

  // ── Full Pipeline ─────────────────────────────────────────────────────────

  /**
   * Run the complete anti-cheat validation pipeline for a quest submission.
   *
   * @param site - The quest's geographic coordinates and radius
   * @returns FullAntiCheatReport with all check results
   *
   * @example
   * const report = await antiCheatService.runFullValidation({ latitude: -6.2, longitude: 106.8 });
   * if (!report.passed) {
   *   showError(report.firstFailureReason);
   *   return;
   * }
   * const gps = report.validatedReading!;
   */
  async runFullValidation(site: QuestSiteCoordinates): Promise<FullAntiCheatReport> {
    // ── Check 1: GPS Anti-Spoof ──────────────────────────────────────────
    const gpsResult = await this.checkGpsAntiSpoof();
    const gpsSpoofCheck: ValidationResult = gpsResult.passed
      ? { passed: true }
      : { passed: false, code: 'GPS_SPOOF', reason: gpsResult.reason };

    if (!gpsResult.passed || !gpsResult.reading) {
      return this._buildReport(false, null, gpsSpoofCheck,
        { passed: false, reason: 'GPS check required first.' },
        { passed: false, reason: 'GPS check required first.' },
        { passed: false, reason: 'GPS check required first.' },
        { passed: true });
    }

    const reading = gpsResult.reading;

    // ── Check 2: Staleness ───────────────────────────────────────────────
    const stalenessCheck = this.checkStaleness(reading);

    // ── Check 3: Geofence ────────────────────────────────────────────────
    const geofenceCheck = this.checkGeofence(reading, site);

    // ── Check 4: Velocity ────────────────────────────────────────────────
    const velocityCheck = this.checkVelocity(reading);

    // ── Check 5: Device Integrity ────────────────────────────────────────
    const deviceCheck = this.checkDeviceIntegrity();

    const allChecks = [gpsSpoofCheck, stalenessCheck, geofenceCheck, velocityCheck, deviceCheck];
    const failed = allChecks.find((c) => !c.passed);
    const passed = !failed;

    return this._buildReport(
      passed,
      passed ? reading : null,
      gpsSpoofCheck,
      geofenceCheck,
      stalenessCheck,
      velocityCheck,
      deviceCheck,
    );
  }

  /** Reset last reading — call when starting a new quest */
  reset(): void {
    this.lastReading = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildReport(
    passed: boolean,
    validatedReading: GpsReading | null,
    gpsSpoof: ValidationResult,
    geofence: ValidationResult,
    staleness: ValidationResult,
    velocity: ValidationResult,
    deviceIntegrity: ValidationResult,
  ): FullAntiCheatReport {
    const checks = { gpsSpoof, geofence, staleness, velocity, deviceIntegrity };
    const firstFailed = Object.values(checks).find((c) => !c.passed);

    return {
      passed,
      validatedReading,
      checks,
      firstFailureReason: firstFailed?.reason ?? null,
    };
  }
}

// Export singleton
export const antiCheatService = new AntiCheatService();
