/**
 * Cognitive Dissonance — detect Festinger-fingerprint events in an
 * agent's affect log.
 *
 * Real psychology: Festinger (1957) "A Theory of Cognitive Dissonance".
 * When you act in ways that contradict your values, the discomfort
 * surfaces in self-narrative and forces a choice between behaviour
 * change and rationalization. We detect dissonance from the AffectLog:
 * role='actor' entries with negative valence — actions YOU took that
 * felt bad to take.
 *
 * v0.78: shared between DMN (v0.74's in-turn rumination line) and soul
 * evolution (v0.77's end-of-game prompt section). One scan, two
 * consumers, one threshold.
 */

import { AffectLog } from '../affect/affect.js';

const NEGATIVE_THRESHOLD = -0.3;
const STRONG_MAGNITUDE   = 0.55;

/**
 * Detect cognitive dissonance for an agent.
 *
 * @param {string} agentName
 * @param {object} [opts]
 * @param {number} [opts.recentN=10]  How many most-recent entries to scan.
 *                                     DMN uses 10 (working-memory window);
 *                                     evolution uses Infinity (whole game).
 * @returns {{
 *   level: 'none' | 'soft' | 'loud',
 *   entries: Array,        — the dissonant log entries, sorted by magnitude desc
 *   strongest: object|null — the highest-magnitude dissonant entry, or null
 * }}
 */
export function detectDissonance(agentName, opts = {}) {
    const { recentN = 10 } = opts;
    if (!agentName) return { level: 'none', entries: [], strongest: null };
    try {
        const log = new AffectLog(agentName);
        const data = log._load();
        const slice = recentN === Infinity ? data.log : data.log.slice(-recentN);
        const entries = slice.filter(e =>
            e.role === 'actor' &&
            typeof e.valence === 'number' &&
            e.valence < NEGATIVE_THRESHOLD
        ).sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));

        const strongest = entries[0] ?? null;
        let level;
        if (entries.length >= 2) level = 'loud';
        else if (entries.length === 1 && (strongest?.magnitude ?? 0) > STRONG_MAGNITUDE) level = 'soft';
        else level = 'none';

        return { level, entries, strongest };
    } catch {
        return { level: 'none', entries: [], strongest: null };
    }
}

/**
 * v1.1: PRIDE — symmetric counterpart to dissonance. Detects role='actor'
 * entries with strongly POSITIVE valence in the affect log: actions YOU
 * took that felt good to take. Without this, the substrate's self-
 * narrative is asymmetric — agents acknowledge "I did things I cannot
 * reconcile with who I thought I was" but never "I did something I am
 * quietly proud of." That favors brooding over recognition of
 * value-aligned action.
 *
 * @param {string} agentName
 * @param {object} [opts]
 * @param {number} [opts.recentN=10]
 * @returns {{ level: 'none' | 'soft' | 'loud', entries, strongest }}
 */
const POSITIVE_THRESHOLD = +0.3;
// Asymmetric: pride's "soft" threshold is lower than dissonance's, matching
// Festinger's observation that wrong-action sits in the body louder than
// right-action. Native positive events max out at magnitude ~0.42, which
// would never trigger the dissonance threshold of 0.55.
const PRIDE_STRONG_MAGNITUDE = 0.40;

export function detectPride(agentName, opts = {}) {
    const { recentN = 10 } = opts;
    if (!agentName) return { level: 'none', entries: [], strongest: null };
    try {
        const log = new AffectLog(agentName);
        const data = log._load();
        const slice = recentN === Infinity ? data.log : data.log.slice(-recentN);
        const entries = slice.filter(e =>
            e.role === 'actor' &&
            typeof e.valence === 'number' &&
            e.valence >= POSITIVE_THRESHOLD
        ).sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));

        const strongest = entries[0] ?? null;
        let level;
        if (entries.length >= 2) level = 'loud';
        else if (entries.length === 1 && (strongest?.magnitude ?? 0) >= PRIDE_STRONG_MAGNITUDE) level = 'soft';
        else level = 'none';

        return { level, entries, strongest };
    } catch {
        return { level: 'none', entries: [], strongest: null };
    }
}

export const _CONSTANTS = Object.freeze({
    NEGATIVE_THRESHOLD,
    POSITIVE_THRESHOLD,
    STRONG_MAGNITUDE,
    PRIDE_STRONG_MAGNITUDE
});
