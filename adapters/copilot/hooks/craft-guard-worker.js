/**
 * Computes the guard verdict off the hook's main thread, so a parse that
 * blocks its event loop cannot stop the main thread from enforcing the
 * deadline. A separate module (not an isMainThread split of craft-guard.js)
 * keeps the main file free of static imports and the worker free of the crash
 * handlers; a load failure here surfaces as the Worker's `error` event.
 */
import { parentPort, workerData } from 'node:worker_threads';

const { buildAuditEntry, decideGuard } = await import('../src/git-guard-adapter.js');

const verdict = decideGuard(workerData);
parentPort.postMessage({ verdict, audit: buildAuditEntry(workerData, verdict) });
