import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPS } from './config';
import { enqueue } from './queue';
import { flushQueue } from './sync';
import type { GpsPoint } from './api';

export const TASK_NAME = 'drive611-background-location';

// Some devices report -1 for "unknown" speed/heading; the server only accepts real values.
const valid = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);

export function toPoint(loc: Location.LocationObject): GpsPoint {
  return {
    eventId: Crypto.randomUUID(),
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    // The time of the GPS fix itself, not of the upload.
    gpsTimestamp: new Date(loc.timestamp).toISOString(),
    accuracyMeters: valid(loc.coords.accuracy),
    speedMps: valid(loc.coords.speed),
    headingDegrees: valid(loc.coords.heading),
  };
}

export type LastFix = { latitude: number; longitude: number; accuracy: number | null; at: number };
let lastFix: LastFix | null = null;
let lastFixError = '';
let watcher: Location.LocationSubscription | null = null;
export const getLastFix = () => ({ fix: lastFix, error: lastFixError });

// Stores fixes in the queue first, then uploads. Used by both the background task and the
// foreground watcher, so the app behaves the same either way.
async function record(locations: Location.LocationObject[]) {
  if (!locations.length) return;
  const newest = locations[locations.length - 1];
  lastFix = { latitude: newest.coords.latitude, longitude: newest.coords.longitude, accuracy: valid(newest.coords.accuracy), at: Date.now() };
  lastFixError = '';
  await enqueue(locations.map(toPoint));
  await flushQueue();
}

// Runs in the background, also while the app is closed. Every fix is written to
// the queue first and uploaded second, so nothing is lost if the upload fails.
TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (!locations.length) return;
  await record(locations);
});

export type TrackingPermission = 'granted' | 'foreground-only' | 'denied';

// Foreground permission first, then "always": the OS requires this order.
export async function requestTrackingPermission(): Promise<TrackingPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    // Expo Go cannot ask for background access; the foreground permission is enough to share while the app is open.
    return 'foreground-only';
  }
}

export async function currentPermission(): Promise<TrackingPermission> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    return 'foreground-only';
  }
}

export const isTracking = async () => !!watcher || (await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false));

const OFF_KEY = 'sharing_off_v1';
// Sharing starts by itself once the driver has a truck and has allowed location; it stays off only
// after the driver switched it off on purpose.
export const sharingSwitchedOff = () => AsyncStorage.getItem(OFF_KEY).then((v) => v === '1').catch(() => false);
export const setSharingSwitchedOff = (off: boolean) => (off ? AsyncStorage.setItem(OFF_KEY, '1') : AsyncStorage.removeItem(OFF_KEY)).catch(() => {});

export type TrackingMode = 'background' | 'foreground';

// Starts sharing. A first position is sent straight away so the company map shows the truck at once;
// after that the OS delivers fixes. If background tracking is not available (Expo Go, or "Always" not
// granted) it falls back to tracking while the app is open, so the button never silently does nothing.
export async function startTracking(): Promise<TrackingMode> {
  if (await isTracking()) return watcher ? 'foreground' : 'background';

  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((loc) => record([loc]))
    .catch(() => {
      lastFixError = 'Waiting for a GPS position. Go outside or near a window.';
    });

  try {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: GPS.timeIntervalMs,
      distanceInterval: GPS.distanceIntervalM,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android keeps tracking alive only with a visible notification.
      foregroundService: {
        notificationTitle: 'TRUKOVA',
        notificationBody: 'Sharing your truck location with your company.',
      },
    });
    return 'background';
  } catch {
    watcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: GPS.timeIntervalMs, distanceInterval: GPS.distanceIntervalM },
      (loc) => {
        record([loc]).catch(() => {});
      },
    );
    return 'foreground';
  }
}

export async function stopTracking() {
  if (watcher) {
    watcher.remove();
    watcher = null;
  }
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false)) await Location.stopLocationUpdatesAsync(TASK_NAME);
}

// A fresh, accurate position for a trip start/end (PRD 4.3, 4.4). Never a cached or made-up one:
// if the phone cannot get a good fix in time, the driver sees an error and can retry.
export async function getTripFix(): Promise<{ latitude: number; longitude: number; gpsTimestamp: string; accuracyMeters: number }> {
  let loc: Location.LocationObject;
  try {
    loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
    ]);
  } catch {
    throw new Error('Could not get a GPS position. Move to open sky and try again.');
  }
  const accuracy = loc.coords.accuracy;
  if (accuracy == null || accuracy > 100) throw new Error('The GPS signal is too weak. Move to open sky and try again.');
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    gpsTimestamp: new Date(loc.timestamp).toISOString(),
    accuracyMeters: accuracy,
  };
}
