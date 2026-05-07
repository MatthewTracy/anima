/**
 * Atomic IO helpers — durable writes that survive process crashes.
 *
 * Without these, a process killed mid-write can leave a state file half-
 * written. The next reader hits a JSON parse error and silently resets
 * the agent's state, losing accumulated history. This is especially
 * bad for high-write-frequency files like AffectLog.affect.json (every
 * event) and BeliefTable.beliefs.json (every belief update).
 *
 * The standard fix is write-to-temp + rename. Rename within a single
 * filesystem is atomic at the OS level — POSIX guarantees it; Windows
 * provides similar (MoveFileEx with REPLACE_EXISTING). Either the
 * NEW content is fully there, or the OLD content is fully there. Never
 * a partial byte stream.
 *
 * Audit context (v1.1.4): file atomicity was identified as the most
 * dangerous class of latent bug in the substrate. v1.1.4 fixed the
 * cortical-store TOCTOU; v1.1.5 fixed AffectLog corruption-on-crash
 * inline; v1.1.6 extracts this helper and applies it to BeliefTable.
 */

import { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/**
 * Write `data` (string or Buffer) to `path` atomically. Creates the
 * containing directory if needed.
 *
 * Crash-durability: if the process dies between the writeFileSync and
 * the renameSync, the OLD file content is unchanged and a stray
 * `<path>.tmp` is left behind. The next save will overwrite the tmp.
 * If the process dies during the renameSync itself, POSIX guarantees
 * either old or new content but never partial.
 *
 * @param {string} path - destination file path
 * @param {string|Buffer} data - content to write
 * @throws on filesystem errors after best-effort tmp cleanup
 */
export function atomicWriteFileSync(path, data) {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // v1.1.22: include pid + random suffix in the tmp name. Without this,
    // two writers atomically saving to the same destination (e.g. shared
    // logs/feuds.json from multiple test files) raced on a shared
    // <path>.tmp — the second writer's writeFileSync clobbered the
    // first's tmp, then the first's rename succeeded but the second's
    // failed ENOENT. Per-call unique tmp names make atomic writes safe
    // for concurrent destination targets.
    const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        writeFileSync(tmp, data);
        // v1.1.22: retry renameSync on transient Windows errors. Anti-
        // virus scanners and the file indexer can briefly hold the
        // destination's handle, causing EPERM/EACCES on rename. The
        // operation is otherwise legal — a few-millisecond wait is
        // enough to clear the lock. POSIX systems don't hit this
        // (rename is unconditional there) but the retry is harmless.
        let lastErr = null;
        const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                renameSync(tmp, path);
                return;
            } catch (e) {
                lastErr = e;
                if (!TRANSIENT_CODES.has(e?.code)) throw e;
                // Brief sync sleep before retry — Atomics.wait on
                // SharedArrayBuffer is the standard sync-sleep idiom.
                const buf = new SharedArrayBuffer(4);
                Atomics.wait(new Int32Array(buf), 0, 0, 10 * (attempt + 1));
            }
        }
        throw lastErr;
    } catch (e) {
        // Best-effort tmp cleanup; ignore if absent.
        try { unlinkSync(tmp); } catch { /* ok */ }
        throw e;
    }
}
