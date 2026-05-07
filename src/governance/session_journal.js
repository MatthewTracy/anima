/**
 * Session Journal (#14) — persistent memory of past games across sessions.
 *
 * Each completed game appends a brief summary to logs/sessions/journal.json.
 * The most recent N sessions are injected into agent prompts via $GOVERNANCE
 * so agents remember "Last game I lost the election to Hamilton."
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from '../../core/runtime/atomic_io.js';

const JOURNAL_DIR = './logs/sessions';
const JOURNAL_FILE = join(JOURNAL_DIR, 'journal.json');
const MAX_SESSIONS_REMEMBERED = 5;

function load() {
    try {
        if (!existsSync(JOURNAL_FILE)) return [];
        return JSON.parse(readFileSync(JOURNAL_FILE, 'utf8'));
    } catch (e) {
        console.warn('[JOURNAL] load failed:', e.message);
        return [];
    }
}

function ensureDir() {
    try {
        if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true });
    } catch (e) { /* ignore */ }
}

export function appendSession({ sessionId, finalScores, governanceState, durationMinutes, endReason }) {
    ensureDir();
    const journal = load();

    const entry = {
        sessionId,
        date: new Date().toISOString(),
        durationMinutes: durationMinutes?.toFixed?.(1) || durationMinutes,
        endReason: endReason || 'timeout',
        winner: finalScores?.winner || 'unknown',
        constitutionalScore: finalScores?.constitutional?.weightedTotal?.toFixed(1) || '?',
        anarchyScore: finalScores?.anarchy?.weightedTotal?.toFixed(1) || '?',
        // Capture key governance moments
        presidents: governanceState?.elections
            ?.filter(e => e.status === 'completed' && e.office === 'president' && e.winner)
            ?.map(e => e.winner) || [],
        judges: governanceState?.elections
            ?.filter(e => e.status === 'completed' && e.office === 'judge' && e.winner)
            ?.map(e => e.winner) || [],
        lawsEnacted: governanceState?.laws?.filter(l => l.status === 'enacted').length || 0,
        lawsuits: governanceState?.cases?.length || 0,
        treaties: governanceState?.treaties?.filter(t => t.status === 'accepted').length || 0,
        wars: governanceState?.eventLog?.filter(e => e.type === 'war_declared').length || 0,
        kills: {
            constitutional: finalScores?.constitutional?.combatKills || 0,
            anarchy: finalScores?.anarchy?.combatKills || 0
        }
    };

    journal.push(entry);
    // Keep only last MAX_SESSIONS_REMEMBERED entries to prevent unbounded growth
    if (journal.length > MAX_SESSIONS_REMEMBERED * 2) {
        journal.splice(0, journal.length - MAX_SESSIONS_REMEMBERED * 2);
    }

    try {
        // v1.1.38: atomic write. session_journal.json is shared mutable
        // state across runs (read+modify+write pattern), so a crash mid-
        // write would lose the entire history of past games. Same risk
        // class as the core/ state files migrated in v1.1.5–v1.1.13.
        atomicWriteFileSync(JOURNAL_FILE, JSON.stringify(journal, null, 2));
        console.log(`[JOURNAL] Appended session ${sessionId}. ${journal.length} sessions remembered.`);
    } catch (e) {
        console.warn('[JOURNAL] write failed:', e.message);
    }
}

/**
 * Returns a compact text summary of recent sessions for prompt injection.
 * Empty string if no past games.
 */
export function getRecentSessionsSummary() {
    const journal = load();
    if (journal.length === 0) return '';
    const recent = journal.slice(-MAX_SESSIONS_REMEMBERED);

    let text = '\n--- PAST GAME HISTORY (recent first) ---\n';
    for (const s of recent.reverse()) {
        const presStr = s.presidents.length > 0 ? `Presidents: ${s.presidents.join(' → ')}` : 'No president elected';
        const result = `${s.winner} won ${s.constitutionalScore} vs ${s.anarchyScore}`;
        text += `[${s.date.slice(0, 10)}] ${result} | Laws: ${s.lawsEnacted}, Lawsuits: ${s.lawsuits}, Treaties: ${s.treaties}, Wars: ${s.wars} | ${presStr}\n`;
    }
    return text;
}
