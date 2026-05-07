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
    const tmp = path + '.tmp';
    try {
        writeFileSync(tmp, data);
        renameSync(tmp, path);
    } catch (e) {
        // Best-effort tmp cleanup; ignore if absent.
        try { unlinkSync(tmp); } catch { /* ok */ }
        throw e;
    }
}
