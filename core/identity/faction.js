/**
 * Faction — group identity at runtime.
 *
 * Real psychology: Henri Tajfel's MINIMAL GROUP PARADIGM (1971). When
 * humans are randomly sorted into arbitrary groups — even labeled by a
 * coin flip — they immediately favor in-group members and discriminate
 * against out-group. Group identity is one of the cheapest, most
 * powerful biases the brain runs.
 *
 * Anima up to v0.47 had factions only as a STATIC seed value baked into
 * each agent's soul.md. That's enough to print "of the crew kind" but
 * doesn't support mid-game faction shifts (mutinies, conversions,
 * defections) and can't be read efficiently at runtime.
 *
 * This module gives factions a fast on-disk representation — one line
 * per agent at bots/<name>/faction.txt — that can be read and written
 * mid-game. v0.48 wires this into belief_table updates so witnessed
 * events are filtered through in/out-group bias.
 *
 * Reading order: faction.txt → soul.md (legacy) → 'unknown'.
 *
 * Background reading: Tajfel (1971) "Experiments in intergroup
 * discrimination"; Brewer's "Optimal Distinctiveness Theory"; Crystal
 * & Smith on coalition psychology.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';

const BOTS_DIR = './bots';
const FACTION_FILE = 'faction.txt';
const SOUL_FILE = 'soul.md';

/** Per-process cache. faction reads happen many times per turn; the
 * file is tiny and rarely changes. */
const _cache = new Map();

/**
 * Get an agent's current faction. Returns 'unknown' if no faction file
 * and no faction tag in soul.md.
 *
 * @param {string} agentName
 * @returns {string} lowercase faction name (or 'unknown')
 */
export function getFaction(agentName) {
    if (!agentName) return 'unknown';
    if (_cache.has(agentName)) return _cache.get(agentName);

    const factionPath = join(BOTS_DIR, agentName, FACTION_FILE);
    if (existsSync(factionPath)) {
        try {
            const f = readFileSync(factionPath, 'utf8').trim().toLowerCase();
            if (f) {
                _cache.set(agentName, f);
                return f;
            }
        } catch { /* fall through */ }
    }

    // Legacy: parse from soul.md. Match the template phrasing
    // "of the X kind" written by Soul.seed().
    const soulPath = join(BOTS_DIR, agentName, SOUL_FILE);
    if (existsSync(soulPath)) {
        try {
            const soul = readFileSync(soulPath, 'utf8');
            const m = soul.match(/of the\s+([A-Za-z][A-Za-z0-9_-]*)\s+kind/i);
            if (m && m[1]) {
                const f = m[1].toLowerCase();
                _cache.set(agentName, f);
                return f;
            }
        } catch { /* nonfatal */ }
    }

    _cache.set(agentName, 'unknown');
    return 'unknown';
}

/**
 * Set an agent's faction. Writes faction.txt and busts the cache.
 * Use for in-game faction changes: mutiny succeeds, novice professes,
 * defector crosses lines.
 */
export function setFaction(agentName, faction) {
    if (!agentName || !faction) return;
    const normalized = String(faction).trim().toLowerCase();
    if (!normalized) return;

    try {
        atomicWriteFileSync(join(BOTS_DIR, agentName, FACTION_FILE), normalized);
        _cache.set(agentName, normalized);
    } catch (e) {
        console.warn(`[FACTION] Failed to set faction for ${agentName}: ${e.message}`);
    }
}

/**
 * Returns true if both agents share a faction (and both factions are
 * known — two 'unknown' agents are not considered in-group).
 */
export function sharesFaction(a, b) {
    if (!a || !b || a === b) return false;
    const fa = getFaction(a);
    const fb = getFaction(b);
    if (fa === 'unknown' || fb === 'unknown') return false;
    return fa === fb;
}

/**
 * Compute the in-group bias multiplier for a witness perceiving an actor.
 *
 * Tajfel-style asymmetry:
 *   Same faction (in-group):
 *     positive delta (actor did good)    → amplified  (×1 + INGROUP_GAIN_BOOST)
 *     negative delta (actor did harm)    → dampened   (×1 - INGROUP_LOSS_DAMP)
 *   Cross faction (out-group):
 *     positive delta (out-group did good)→ dampened   (×1 - OUTGROUP_GAIN_DAMP)
 *     negative delta (out-group did harm)→ amplified  (×1 + OUTGROUP_LOSS_BOOST)
 *   Unknown faction on either side: no modulation (×1.0)
 *
 * Numbers are intentionally moderate. Combined with the v0.45 amygdala
 * scale and v0.47 surprise scale, the cumulative ceiling on any single
 * delta is ~1.5 × 2.5 × 1.2 ≈ 4.5×. The BeliefTable clamps at ±1.0, so
 * extreme scenarios can't overshoot, just saturate faster.
 *
 * @param {string} witnessName
 * @param {string} actorName
 * @param {number} delta - the SIGNED nominal delta about to be applied
 * @returns {number} multiplier, typically in [0.85, 1.20]
 */
const INGROUP_GAIN_BOOST = 0.20;   // good ally → +20%
const INGROUP_LOSS_DAMP  = 0.15;   // bad ally → -15% (cushion / motivated reasoning)
const OUTGROUP_GAIN_DAMP = 0.15;   // good rival → -15% (downplay grace)
const OUTGROUP_LOSS_BOOST = 0.15;  // bad rival → +15% (suspicion confirmed)

export function ingroupBias(witnessName, actorName, delta) {
    if (typeof delta !== 'number' || Number.isNaN(delta) || delta === 0) return 1.0;
    if (!witnessName || !actorName || witnessName === actorName) return 1.0;

    const wf = getFaction(witnessName);
    const af = getFaction(actorName);
    if (wf === 'unknown' || af === 'unknown') return 1.0;

    const same = wf === af;
    const positive = delta > 0;

    if (same && positive)   return 1.0 + INGROUP_GAIN_BOOST;
    if (same && !positive)  return 1.0 - INGROUP_LOSS_DAMP;
    if (!same && positive)  return 1.0 - OUTGROUP_GAIN_DAMP;
    /* !same && !positive */ return 1.0 + OUTGROUP_LOSS_BOOST;
}

/**
 * Diagnostic helper: explain the bias. Useful for inspectors / logs.
 */
export function explainIngroup(witnessName, actorName, delta) {
    const wf = getFaction(witnessName);
    const af = getFaction(actorName);
    const multiplier = ingroupBias(witnessName, actorName, delta);
    let reason;
    if (wf === 'unknown' || af === 'unknown') {
        reason = 'no faction known on at least one side';
    } else if (wf === af) {
        reason = delta > 0
            ? `in-group: praising one of our own (×${multiplier.toFixed(2)})`
            : `in-group: cushioning a fault by one of our own (×${multiplier.toFixed(2)})`;
    } else {
        reason = delta > 0
            ? `out-group: discounting good behavior by ${af} (×${multiplier.toFixed(2)})`
            : `out-group: amplifying suspicion of ${af} (×${multiplier.toFixed(2)})`;
    }
    return { multiplier, witnessFaction: wf, actorFaction: af, reason };
}

/**
 * Test/setup helper: clear the in-process cache. Use between tests so
 * stale faction reads don't leak across assertions.
 */
export function _resetFactionCache() {
    _cache.clear();
}
