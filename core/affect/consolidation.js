/**
 * Memory Consolidation — hippocampus → cortex transfer.
 *
 * Real neuroscience: during sleep (especially slow-wave sleep + REM),
 * the hippocampus replays daytime events. Strong-affect events get
 * consolidated into long-term cortical memory; weak ones decay and
 * are pruned. This is why we remember vivid moments years later but
 * not what we ate three Tuesdays ago.
 *
 * Anima up to v0.45 had per-game AffectLog (the hippocampal store) but
 * no transfer mechanism. The soul evolution prompt read raw affect log
 * and was supposed to "do consolidation" implicitly via the LLM. That
 * works but is wasteful — every soul evolution re-derives consolidation
 * patterns from scratch, and the result depends on the LLM's mood that
 * day.
 *
 * This module ships explicit consolidation as a deterministic step that
 * runs BEFORE soul evolution at game end:
 *
 *   1. Take the per-game AffectLog (high-resolution, episodic memory)
 *   2. Extract top-K most-charged moments (working-memory cap = 7)
 *   3. Detect recurring themes (event types appearing 2+ times)
 *   4. Compose a deterministic narrative summary
 *   5. Append a CONSOLIDATED ENTRY to bots/<name>/consolidated_memory.md
 *      — this is the cortical store, survives games
 *   6. Clear the AffectLog (the hippocampus resets nightly)
 *
 * Result: the soul evolution prompt now sees a consolidated semantic
 * digest (cortical memory) PLUS the prior soul (long-term identity).
 * Cross-game memory becomes structurally clean rather than implicit.
 *
 * Background reading: McGaugh on emotional memory consolidation; Born
 * & Wilhelm (2012) "System consolidation of memory during sleep";
 * Squire's medial-temporal-lobe model of declarative memory; Walker
 * "Why We Sleep" (popular treatment).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { AffectLog } from './affect.js';

const BOTS_DIR = './bots';
const WORKING_MEMORY_CAP = 7;            // Miller's 7±2; we use 7 for top-moments cap
const THEME_THRESHOLD = 2;               // event type must repeat ≥ this to count as a theme

/**
 * Run consolidation for one agent. Should be called AT GAME END, BEFORE
 * soul evolution. Returns the consolidation entry.
 *
 * @param {string} agentName
 * @param {object} [opts]
 * @param {string} [opts.scenario] — for the consolidation entry's metadata
 * @param {boolean} [opts.clearAffectLog=true] — clear the hippocampal
 *        store after consolidation (default true; the brain does this
 *        every night)
 * @returns {object} the consolidation entry
 */
export function consolidate(agentName, { scenario = null, clearAffectLog = true } = {}) {
    const log = new AffectLog(agentName);
    const top = log.topMoments(WORKING_MEMORY_CAP);
    const mood = log.currentMood();

    // Theme detection — repeated event types signal patterns the cortical
    // store should encode as semantic knowledge (e.g., "Hamilton flogged
    // me three times" becomes "Hamilton is harsh", not three separate
    // memories).
    const eventTypeCount = {};
    const otherAgents = {};
    for (const m of top) {
        eventTypeCount[m.type] = (eventTypeCount[m.type] || 0) + 1;
        if (m.actor && m.actor !== agentName) {
            otherAgents[m.actor] = (otherAgents[m.actor] || 0) + 1;
        }
    }
    const themes = Object.entries(eventTypeCount)
        .filter(([_, n]) => n >= THEME_THRESHOLD)
        .map(([k, n]) => ({ pattern: k, count: n }));

    const recurring_others = Object.entries(otherAgents)
        .filter(([_, n]) => n >= THEME_THRESHOLD)
        .map(([k, n]) => ({ agent: k, count: n }));

    const narrative = _composeNarrative(top, mood, themes, recurring_others);

    const entry = {
        date: new Date().toISOString().slice(0, 10),
        scenario: scenario || 'unknown',
        finalMood: mood,
        topMoments: top,
        themes,
        recurring_others,
        narrative
    };

    _appendToCortex(agentName, entry);

    if (clearAffectLog) log.clear();

    return entry;
}

/**
 * Read the consolidated memory file for an agent. Returns the raw
 * markdown text; null if no consolidation has happened yet.
 */
export function readConsolidatedMemory(agentName) {
    const path = join(BOTS_DIR, agentName, 'consolidated_memory.md');
    if (!existsSync(path)) return null;
    try { return readFileSync(path, 'utf8'); }
    catch { return null; }
}

/**
 * Format the consolidated memory for prompt injection. This is what the
 * soul evolution prompt reads — the cortical layer beneath the surface
 * episodic events.
 */
export function asPromptText(agentName, opts = {}) {
    const text = readConsolidatedMemory(agentName);
    if (!text) return '(no consolidated memory yet — this is your first life or first consolidation)';
    // Cap at last ~3000 chars (most recent entries) so we don't overflow prompts
    return text.length > 3000 ? '…' + text.slice(-3000) : text;
}

// ── internals ────────────────────────────────────────────────────────

function _composeNarrative(topMoments, mood, themes, recurringOthers) {
    if (topMoments.length === 0) {
        return 'Nothing of note. The day passed without weight.';
    }
    const parts = [];
    // Final-mood framing
    parts.push(`Ended ${mood.label} (valence ${mood.valence > 0 ? '+' : ''}${mood.valence.toFixed(2)}, arousal ${mood.arousal.toFixed(2)}).`);

    // Top moment, narrated
    const t = topMoments[0];
    if (t) {
        const sign = t.valence > 0 ? 'positive' : 'negative';
        const who = t.actor && t.actor !== '_self' ? `${t.actor}` : 'I';
        const target = t.target ? ` to ${t.target}` : '';
        parts.push(`Single most-charged moment: ${who} ${t.type}${target} (${sign}, |${Math.abs(t.valence).toFixed(2)}| × ${t.arousal.toFixed(2)} = ${t.magnitude.toFixed(2)}).`);
    }

    // Themes
    if (themes.length > 0) {
        const themeStrs = themes.map(t => `${t.pattern}×${t.count}`).join(', ');
        parts.push(`Recurring patterns: ${themeStrs}. (These belong in semantic memory — not as separate events but as a learned generalization.)`);
    }

    // Recurring others
    if (recurringOthers.length > 0) {
        const others = recurringOthers.map(o => `${o.agent} (${o.count} charged interactions)`).join(', ');
        parts.push(`Charged-with-most: ${others}.`);
    }

    return parts.join(' ');
}

function _appendToCortex(agentName, entry) {
    try {
        const dir = join(BOTS_DIR, agentName);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const path = join(dir, 'consolidated_memory.md');

        const block = [
            `\n\n## ${entry.date} — ${entry.scenario}`,
            ``,
            entry.narrative,
            ``
        ].join('\n');

        // v1.1.4: TOCTOU-safe initialization. The previous existsSync + write
        // pattern had a race where two processes both saw the missing file
        // and both wrote the header, the second truncating the first. Now
        // the header write uses the 'wx' flag — atomic create-fail-if-exists
        // at the OS level. On EEXIST we fall through to plain append; the
        // header is already there.
        const header =
            `# ${agentName} — Consolidated Memory\n\n` +
            `> *Cortical store. Each entry is the residue of one game's emotional ` +
            `arc, after the hippocampal AffectLog has been replayed and decayed. ` +
            `Survives across runs. Read by soul evolution as the long-term ` +
            `semantic layer beneath the prior soul.*\n`;
        try {
            writeFileSync(path, header + block, { flag: 'wx' });
            // wx succeeded — we created the file with header + first block.
        } catch (e) {
            if (e && e.code === 'EEXIST') {
                // Another writer already created the header. Just append our block.
                appendFileSync(path, block);
            } else {
                throw e;
            }
        }
    } catch (e) {
        console.warn(`[CONSOLIDATION] Failed to append for ${agentName}: ${e.message}`);
    }
}
