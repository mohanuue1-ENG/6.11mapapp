import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

// Tokens live in the device's secure storage (Keychain / Keystore), never in
// plain AsyncStorage. The refresh token is single-use: every refresh returns a
// new one, which is saved before anything else happens.
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type DriverProfile = {
  driver: { id: string; name: string; phone: string | null; driverNumber: string | null };
  company: { id: string; name: string };
  truck: { id: string; truckNumber: string; plateNumber: string | null; make: string | null; model: string | null } | null;
  activeTrip: { id: string; startedAt: string } | null;
};

export type BatchResult = {
  batchId: string;
  accepted: number;
  duplicates: number;
  rejected: { index: number; eventId: string | null; reason: string }[];
};

export type GpsPoint = {
  eventId: string;
  latitude: number;
  longitude: number;
  gpsTimestamp: string;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
};

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers: Record<string, string> = { 'X-Client-Type': 'mobile' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers });
  } catch {
    // No connection: the caller keeps its data and retries later.
    throw new ApiError(0, 'NETWORK', 'No connection');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? `Error ${res.status}`);
  return data;
}

async function saveTokens(data: { accessToken: string; refreshToken: string }) {
  accessToken = data.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken);
  await SecureStore.setItemAsync(ACCESS_KEY, data.accessToken);
}

export async function clearTokens() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
}

// Shared by every caller (foreground screens and the background task), because
// two parallel refreshes with the same single-use token would look like theft
// and the server would close the session.
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const token = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!token) return false;
      try {
        await saveTokens(await raw('/auth/refresh', { method: 'POST', auth: false, body: JSON.stringify({ refreshToken: token }) }));
        return true;
      } catch (err) {
        // Only a definite refusal ends the session; a network error must not sign the driver out.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await clearTokens();
          onSignedOut?.();
          return false;
        }
        throw err;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// Authenticated call with one automatic token renewal.
export async function call(path: string, init: RequestInit = {}) {
  if (!accessToken) accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  try {
    return await raw(path, init);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    if (!(await refreshSession())) throw err;
    return raw(path, init);
  }
}

export async function login(email: string, password: string) {
  const data = await raw('/auth/login', { method: 'POST', auth: false, body: JSON.stringify({ email, password }) });
  if (data.user.role !== 'DRIVER') {
    throw new ApiError(403, 'FORBIDDEN', 'This app is for drivers. Company administrators sign in on the website.');
  }
  await saveTokens(data);
  return data.user as { id: string; name: string };
}

export async function logout() {
  const token = await SecureStore.getItemAsync(REFRESH_KEY);
  if (token) await raw('/auth/logout', { method: 'POST', auth: false, body: JSON.stringify({ refreshToken: token }) }).catch(() => {});
  await clearTokens();
}

export const hasSession = async () => !!(await SecureStore.getItemAsync(REFRESH_KEY));

export type Trip = {
  id: string;
  status: 'ACTIVE' | 'COMPLETED';
  truck: { id: string; truckNumber: string };
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

export type GpsFix = { latitude: number; longitude: number; gpsTimestamp: string; accuracyMeters: number };

export const startTrip = (fix: GpsFix): Promise<{ trip: Trip }> => call('/trips/start', { method: 'POST', body: JSON.stringify(fix) });
export const endTrip = (id: string, fix: GpsFix): Promise<{ trip: Trip }> => call(`/trips/${id}/end`, { method: 'POST', body: JSON.stringify(fix) });
export const listTrips = (limit = 10): Promise<{ trips: Trip[] }> => call(`/trips?limit=${limit}`);

export const getProfile = (): Promise<DriverProfile> => call('/driver/me');

export const uploadBatch = (batchId: string, locations: GpsPoint[]): Promise<BatchResult> =>
  call('/gps/locations/batch', { method: 'POST', body: JSON.stringify({ batchId, locations }) });
