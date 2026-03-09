// ─────────────────────────────────────────────────────────────────────────────
// LocationService.ts
// EcoQuest Mobile — GPS Location Singleton Service
//
// Centralizes all expo-location interactions:
//   - Permission request & status management
//   - Foreground location watching (active quest session)
//   - One-shot location fetch with accuracy guarantee
//   - Distance calculation (Haversine formula)
//   - Geofence check (player inside quest zone radius)
//
// Used by: AntiCheatService, useQuestSubmission, ProofOfActivityScreen
// ─────────────────────────────────────────────────────────────────────────────

import * as Location from 'expo-location';
import type { GpsReading } from '@features/proof-of-activity/types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum acceptable GPS accuracy in meters to trust a reading */
const MIN_ACCURACY_METERS = 100;

/** Earth radius for Haversine calculation */
const EARTH_RADIUS_M = 6_371_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}

export interface GeofenceCheckResult {
  inside: boolean;
  distanceMeters: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toGpsReading(loc: Location.LocationObject): GpsReading {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
    mocked: (loc as unknown as { mocked?: boolean }).mocked === true,
    timestamp: loc.timestamp,
  };
}

/**
 * Haversine distance between two lat/lon points.
 * Returns distance in meters.
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── LocationService Class ─────────────────────────────────────────────────────

class LocationService {
  private watchSubscription: Location.LocationSubscription | null = null;

  // ── 1. Permission Management ───────────────────────────────────────────────

  /**
   * Request foreground location permission.
   * On Android, also triggers the custom rationale dialog from expo-location plugin.
   */
  async requestPermission(): Promise<LocationPermissionStatus> {
    const { status, canAskAgain } =
      await Location.requestForegroundPermissionsAsync();

    return {
      granted: status === 'granted',
      canAskAgain,
    };
  }

  /** Check current permission status without prompting */
  async getPermissionStatus(): Promise<LocationPermissionStatus> {
    const { status, canAskAgain } =
      await Location.getForegroundPermissionsAsync();

    return {
      granted: status === 'granted',
      canAskAgain,
    };
  }

  // ── 2. One-Shot Location Fetch ─────────────────────────────────────────────

  /**
   * Fetch current location with high accuracy.
   * Waits until accuracy is within `minAccuracyMeters` or throws after timeout.
   *
   * @param minAccuracyMeters - Maximum acceptable horizontal accuracy (default: 100m)
   * @throws Error if permission denied or GPS unavailable
   */
  async getCurrentLocation(
    minAccuracyMeters: number = MIN_ACCURACY_METERS
  ): Promise<GpsReading> {
    const { granted } = await this.requestPermission();

    if (!granted) {
      throw new Error(
        'Location permission denied. EcoQuest requires GPS to verify quest completion.'
      );
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });

    const reading = toGpsReading(loc);

    if (reading.accuracy !== null && reading.accuracy > minAccuracyMeters) {
      throw new Error(
        `GPS accuracy too low (${reading.accuracy.toFixed(0)}m). ` +
          'Please move to an open area with a clear sky view.'
      );
    }

    return reading;
  }

  // ── 3. Location Watching (Active Quest Session) ────────────────────────────

  /**
   * Start watching location updates for an active quest session.
   * Updates are throttled to `distanceIntervalMeters` to preserve battery.
   *
   * @param onUpdate - Called with each new GpsReading
   * @param distanceIntervalMeters - Minimum movement to trigger update (default: 5m)
   */
  async startWatching(
    onUpdate: (reading: GpsReading) => void,
    distanceIntervalMeters = 5
  ): Promise<void> {
    if (this.watchSubscription) return; // Already watching

    const { granted } = await this.getPermissionStatus();
    if (!granted) return;

    this.watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: distanceIntervalMeters,
        mayShowUserSettingsDialog: false,
      },
      (loc) => onUpdate(toGpsReading(loc))
    );
  }

  /** Stop watching location — call when quest session ends */
  stopWatching(): void {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
  }

  // ── 4. Geofence Check ─────────────────────────────────────────────────────

  /**
   * Check if a GPS reading is inside a circular quest zone.
   *
   * @param reading - Player's current GPS position
   * @param questLat - Quest site center latitude
   * @param questLon - Quest site center longitude
   * @param radiusMeters - Quest zone radius (default: 50m)
   */
  checkGeofence(
    reading: GpsReading,
    questLat: number,
    questLon: number,
    radiusMeters = 50
  ): GeofenceCheckResult {
    const distanceMeters = haversineDistance(
      reading.latitude, reading.longitude,
      questLat, questLon
    );

    return {
      inside: distanceMeters <= radiusMeters,
      distanceMeters,
    };
  }

  // ── 5. Distance Utility ────────────────────────────────────────────────────

  /**
   * Calculate distance in meters between two GPS readings.
   * Useful for path tracking during quest walks.
   */
  distanceBetween(a: GpsReading, b: GpsReading): number {
    return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  }
}

// Export singleton
export const locationService = new LocationService();
