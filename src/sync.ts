import * as Crypto from 'expo-crypto';
import { ApiError, uploadBatch } from './api';
import { GPS } from './config';
import { peek, remove, writeMeta } from './queue';

let running: Promise<{ sent: number; failed: boolean }> | null = null;

// Uploads queued points in bounded batches until the queue is empty or the
// network fails. Safe to call from anywhere at any time: concurrent calls share
// one run.
//
// A point leaves the queue only when the server has settled it:
//   accepted / duplicate -> stored
//   rejected             -> will never be accepted (bad data, no truck at that time), retrying is pointless
// On any network or server error the points stay and are retried on the next run.
export function flushQueue() {
  if (!running) {
    running = run().finally(() => {
      running = null;
    });
  }
  return running;
}

async function run() {
  let sent = 0;
  try {
    for (;;) {
      const points = await peek(GPS.batchSize);
      if (!points.length) break;
      const result = await uploadBatch(Crypto.randomUUID(), points);
      await remove(points.map((p) => p.eventId));
      sent += result.accepted;
      await writeMeta({ lastSyncAt: new Date().toISOString(), lastError: null });
    }
    return { sent, failed: false };
  } catch (err) {
    const message =
      err instanceof ApiError && err.code === 'NETWORK' ? 'Waiting for connection' : err instanceof Error ? err.message : 'Upload failed';
    await writeMeta({ lastError: message });
    return { sent, failed: true };
  }
}
