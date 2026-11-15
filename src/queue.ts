import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPS } from './config';
import type { GpsPoint } from './api';

// Persistent offline queue (PRD 4.2). Points keep the timestamp and eventId they
// were created with, so a late upload is stored with its original time and a
// repeated upload is ignored by the server.
const POINTS_KEY = 'gps_queue_v1';
const META_KEY = 'gps_sync_meta_v1';

export type SyncMeta = { lastSyncAt: string | null; lastError: string | null };

// Every read-modify-write runs one after another, so the background task and
// the screen can never overwrite each other's changes.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

async function read(): Promise<GpsPoint[]> {
  try {
    const text = await AsyncStorage.getItem(POINTS_KEY);
    return text ? (JSON.parse(text) as GpsPoint[]) : [];
  } catch {
    return [];
  }
}

export const enqueue = (points: GpsPoint[]) =>
  serial(async () => {
    const all = [...(await read()), ...points];
    // Bounded storage: when full, the oldest points are the ones given up.
    const kept = all.length > GPS.maxQueued ? all.slice(all.length - GPS.maxQueued) : all;
    await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(kept));
    return kept.length;
  });

// Oldest first, so the server receives the route in order.
export const peek = (limit: number) => serial(async () => (await read()).slice(0, limit));

export const remove = (eventIds: string[]) =>
  serial(async () => {
    const gone = new Set(eventIds);
    const left = (await read()).filter((p) => !gone.has(p.eventId));
    await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(left));
    return left.length;
  });

export const pendingCount = () => serial(async () => (await read()).length);

export const clearQueue = () => serial(async () => AsyncStorage.removeItem(POINTS_KEY));

export const readMeta = async (): Promise<SyncMeta> => {
  try {
    const text = await AsyncStorage.getItem(META_KEY);
    return text ? JSON.parse(text) : { lastSyncAt: null, lastError: null };
  } catch {
    return { lastSyncAt: null, lastError: null };
  }
};

export const writeMeta = (patch: Partial<SyncMeta>) =>
  serial(async () => {
    const meta = { ...(await readMeta()), ...patch };
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  });
