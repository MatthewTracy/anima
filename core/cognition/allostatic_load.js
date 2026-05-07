/**
 * Allostatic load — the cumulative cost of stress on a nervous system.
 *
 * Real neuroscience: Bruce McEwen's allostatic-load framework (McEwen 1998,
 * "Stress, adaptation, and disease"; McEwen & Gianaros 2010). Each
 * high-arousal event nudges cortisol, sympathetic activation, and other
 * stress mediators upward. Brief activations are adaptive — the body
 * mobilizes, then recovers. But repeated or chronic activation without
 * full recovery accumulates a "load" that wears on the system. Past a
 * threshold, decisions narrow, cognition becomes brittle, mood floors
 * lock in. This is the substrate of burnout, PTSD, and clinical
 * depression's somatic anchor.
 *
 * Anima up to v0.55 had per-event affect (amygdala) and per-event-type
 * habituation, but no SLOW-MOVING reservoir of cumulative load that
 * represents "how much the agent's nervous system has been carrying."
 * A monk who has watched four flogs and witnessed two excommunications
 * and had three vicarious wounds should be a different agent than one
 * who has spent the same game in lectio — even if their per-event
 * memories are similar.
 *
 * Mechanism:
 *   - Each event-induced arousal nudges allostatic load up by a small
 *     fraction (arousal × LOAD_RATE)
 *   - Each call to decay() reduces load by a recovery rate (slow but real)
 *   - load is clamped to [0, 1]
 *   - Above OVERLOADED_THRESHOLD (0.7), the agent is "overloaded": this
 *     state can be read by DMN, soul evolution, and prompt placeholders
 *     to shape behavior toward avoidance, dissociation, or collapse
 *
 * The reservoir is persistent at bots/<name>/allostatic_load.json so it
 * accumulates across turns and survives consolidation/restart.
 *
 * Background: McEwen (1998); Sapolsky (2004) "Why Zebras Don't Get
 * Ulcers"; Juster, McEwen & Lupien (2010) on allostatic load + cognition.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';
import { join } from 'path';

const BOTS_DIR = './bots';
const FILE = 'allostatic_load.json';

const LOAD_RATE          = 0.07;   // each unit of arousal adds 7% load
const RECOVERY_RATE      = 0.03;   // each decay() call removes 3% of current load
const ELEVATED_THRESHOLD = 0.35;
const ALLOSTATIC_THRESHOLD = 0.55;
const OVERLOADED_THRESHOLD = 0.7;

/**
 * Add stress from a single event experience (with given arousal).
 * Returns the new load.
 */
export function recordStress(agentName, arousal) {
    if (!agentName) return 0;
    if (typeof arousal !== 'number' || Number.isNaN(arousal) || arousal <= 0) {
        return getStress(agentName);
    }
    const data = _load(agentName);
    const delta = Math.min(1, Math.max(0, arousal)) * LOAD_RATE;
    data.load = Math.min(1, Math.max(0, data.load + delta));
    data.lastEventAt = Date.now();
    _save(agentName, data);
    return data.load;
}

/**
 * Apply recovery decay. Use between turns or at end-of-game.
 * Default rate is RECOVERY_RATE (multiplicative — current × (1 - rate)).
 */
export function decayStress(agentName, rate = RECOVERY_RATE) {
    if (!agentName) return 0;
    const data = _load(agentName);
    data.load = Math.max(0, data.load * (1 - rate));
    data.lastDecayAt = Date.now();
    _save(agentName, data);
    return data.load;
}

/**
 * Read current allostatic load (0..1).
 */
export function getStress(agentName) {
    if (!agentName) return 0;
    return _load(agentName).load;
}

/**
 * Classify the load into a label.
 */
export function stressLevel(load) {
    if (typeof load !== 'number' || Number.isNaN(load)) return 'baseline';
    if (load >= OVERLOADED_THRESHOLD) return 'overloaded';
    if (load >= ALLOSTATIC_THRESHOLD) return 'allostatic';
    if (load >= ELEVATED_THRESHOLD)   return 'elevated';
    return 'baseline';
}

/**
 * For $STRESS placeholder. Short, evocative — the agent reads about
 * their own body's wear.
 */
export function asPromptText(agentName) {
    const load = getStress(agentName);
    const level = stressLevel(load);
    if (level === 'baseline') {
        return '=== YOUR ALLOSTATIC LOAD ===\nYour body is rested. You can carry what comes.\n=== END LOAD ===';
    }
    const lines = ['=== YOUR ALLOSTATIC LOAD — what your body is carrying ==='];
    switch (level) {
        case 'elevated':
            lines.push('Something keeps tightening across your shoulders. You are still functional but the day has begun to weigh.');
            break;
        case 'allostatic':
            lines.push('Sleep has not been giving back what waking takes. Your edges are fraying. Decisions are getting smaller.');
            break;
        case 'overloaded':
            lines.push('Your nervous system is in a state it cannot sustain. Avoidance is starting to feel reasonable. Smaller choices, fewer risks. The world is loud.');
            break;
    }
    lines.push(`(load: ${load.toFixed(2)}, ${level})`);
    lines.push('=== END LOAD ===');
    return lines.join('\n');
}

/**
 * Apply RECOVERY_RATE decay to a whole roster at once. Use at end of
 * each scenario turn to model "between-event recovery." Without this,
 * stress accumulates monotonically and every agent overloads in 15
 * events — which would not match the McEwen literature.
 *
 * @param {string[]} names
 * @returns {number} count of agents whose load changed
 */
export function tickRecovery(names) {
    if (!Array.isArray(names)) return 0;
    let touched = 0;
    for (const n of names) {
        if (!n) continue;
        const before = getStress(n);
        if (before <= 0) continue;
        decayStress(n);
        touched++;
    }
    return touched;
}

/**
 * Test/setup helper: clear the load file.
 */
export function _clearStress(agentName) {
    if (!agentName) return;
    const path = _path(agentName);
    if (existsSync(path)) {
        try { writeFileSync(path, JSON.stringify({ version: 1, load: 0 }, null, 2)); }
        catch { /* nonfatal */ }
    }
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _path(name) { return join(BOTS_DIR, name, FILE); }

function _load(name) {
    const path = _path(name);
    if (!existsSync(path)) return { version: 1, load: 0 };
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        if (typeof raw.load !== 'number') raw.load = 0;
        return raw;
    } catch {
        return { version: 1, load: 0 };
    }
}

function _save(name, data) {
    try {
        atomicWriteFileSync(_path(name), JSON.stringify(data, null, 2));
    } catch (e) {
        console.warn(`[ALLOSTATIC] Failed to save for ${name}: ${e.message}`);
    }
}

/**
 * Test-only constants for assertions.
 */
export const _THRESHOLDS = Object.freeze({
    ELEVATED: ELEVATED_THRESHOLD,
    ALLOSTATIC: ALLOSTATIC_THRESHOLD,
    OVERLOADED: OVERLOADED_THRESHOLD,
    LOAD_RATE,
    RECOVERY_RATE
});
