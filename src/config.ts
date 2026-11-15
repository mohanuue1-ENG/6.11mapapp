export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

// Starting values. The PRD leaves GPS intervals to be agreed (battery vs accuracy
// vs data cost), so these are meant to be tuned on real devices.
export const GPS = {
  /** Ask the OS for a fix at most this often (ms). */
  timeIntervalMs: 15_000,
  /** ...or after moving this far (m). */
  distanceIntervalM: 25,
  /** Points per upload request; the server accepts up to 500. */
  batchSize: 100,
  /** Oldest points are dropped beyond this many, so storage stays bounded. */
  maxQueued: 5_000,
};
