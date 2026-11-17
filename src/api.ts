import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

// Tokens live in the device's secure storage (Keychain / Keystore), never in
// plain AsyncStorage. The refresh token is single-use: every refresh returns a
// new one, which is saved before anything else happens.
const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
// Kept after sign-out: a phone that was verified and remembered can sign in without a text-message code.
const DEVICE_KEY = 'device_token';

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

export type SessionUser = { id: string; name: string };
export type LoginResult =
  | { kind: 'signedIn'; user: SessionUser }
  | { kind: 'verify'; challengeId: string; hint: string; devCode?: string };

// Keeps the session and, when the server sent one, the "remember this phone" token. Signing in without ticking
// "remember" forgets any older token.
async function startSession(data: any, remember: boolean): Promise<SessionUser> {
  if (data.user.role !== 'DRIVER') {
    throw new ApiError(403, 'FORBIDDEN', 'This app is for drivers. Company administrators sign in on the website.');
  }
  await saveTokens(data);
  if (data.deviceToken) await SecureStore.setItemAsync(DEVICE_KEY, data.deviceToken);
  else if (!remember) await SecureStore.deleteItemAsync(DEVICE_KEY).catch(() => {});
  return data.user;
}

// Step 1 of signing in. A driver is then asked for the code emailed to them, unless this phone was
// verified and remembered within the last 30 days.
export async function login(email: string, password: string): Promise<LoginResult> {
  const deviceToken = await SecureStore.getItemAsync(DEVICE_KEY);
  const data = await raw('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password, ...(deviceToken ? { deviceToken } : {}) }),
  });
  if (data.verificationRequired) {
    return { kind: 'verify', challengeId: data.challengeId, hint: data.hint, devCode: data.devCode };
  }
  return { kind: 'signedIn', user: await startSession(data, true) };
}

// Step 2: the emailed code. With `remember`, this phone skips the code for the next 30 days.
export async function verifyLogin(challengeId: string, code: string, remember: boolean): Promise<SessionUser> {
  const data = await raw('/auth/login/verify', { method: 'POST', auth: false, body: JSON.stringify({ challengeId, code, remember }) });
  return startSession(data, remember);
}

// Creating an account, step 1: is this a phone number a company has set up for a driver?
export async function lookupDriverPhone(phone: string): Promise<void> {
  await raw('/auth/driver/lookup', { method: 'POST', auth: false, body: JSON.stringify({ phone }) });
}

// Step 3: the driver's own email; a code is emailed to it.
export async function requestSignupCode(phone: string, email: string): Promise<{ hint: string; devCode?: string }> {
  return raw('/auth/driver/request-code', { method: 'POST', auth: false, body: JSON.stringify({ phone, email }) });
}

// Step 4: checks the typed code without using it up, so a wrong code is found on the code step.
export async function checkSignupCode(email: string, code: string, purpose: 'register' | 'reset' = 'register'): Promise<void> {
  await raw('/auth/driver/check-code', { method: 'POST', auth: false, body: JSON.stringify({ email, code, purpose }) });
}

// Step 5: the account is created with everything collected.
export async function registerDriver(input: { phone: string; email: string; code: string; name: string; password: string; remember: boolean }): Promise<SessionUser> {
  const data = await raw('/auth/driver/register', { method: 'POST', auth: false, body: JSON.stringify(input) });
  return startSession(data, input.remember);
}

// Forgot password: the phone number and the account's email get a code; the code and a new password finish it.
export async function requestPasswordReset(phone: string, email: string): Promise<{ hint: string; devCode?: string }> {
  return raw('/auth/driver/forgot/request', { method: 'POST', auth: false, body: JSON.stringify({ phone, email }) });
}

export async function resetPassword(input: { phone: string; email: string; code: string; newPassword: string }): Promise<void> {
  await raw('/auth/driver/forgot/reset', { method: 'POST', auth: false, body: JSON.stringify(input) });
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
export type RoutePoint = { latitude: number; longitude: number; speedMps: number | null; gpsTimestamp: string };
// One trip with the points of its route recorded so far.
export const getTrip = (id: string): Promise<{ trip: Trip; route: RoutePoint[] }> => call(`/trips/${id}`);
export const listTrips = (limit = 10): Promise<{ trips: Trip[] }> => call(`/trips?limit=${limit}`);

export const getProfile = (): Promise<DriverProfile> => call('/driver/me');

export const uploadBatch = (batchId: string, locations: GpsPoint[]): Promise<BatchResult> =>
  call('/gps/locations/batch', { method: 'POST', body: JSON.stringify({ batchId, locations }) });
