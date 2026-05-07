/**
 * Habituation & Sensitization — the oldest learning curves in nervous systems.
 *
 * Real neuroscience: Eric Kandel's Nobel-prize work on Aplysia (1970s–2000)
 * established the two opposite response curves to repeated identical stimuli:
 *
 *   HABITUATION   — Response DECAYS with repetition of NON-threatening
 *                   stimuli. The fifth time the train goes by, you no
 *                   longer flinch. The brain saves attention by tuning
 *                   out predictable, low-arousal noise.
 *
 *   SENSITIZATION — Response INCREASES with repetition of HIGH-arousal,
 *                   threat-coded stimuli. The fifth gunshot does not
 *                   produce a smaller startle than the first; if anything,
 *                   it climbs (PTSD-like patterns; LTP at sensory synapses).
 *
 * Both effects are local to the witnessing agent's nervous system —
 * not a property of the event itself. Two witnesses can experience the
 * same repeated stimulus and react with opposite curves depending on
 * how much it has already mattered to them.
 *
 * Anima up to v0.49 had no exposure history per witness × event type.
 * Witnessing the tenth flog produced the same nominal magnitude as the
 * first, which is neurologically wrong on both directions: it should
 * dull (if the witness has dissociated/normalized) OR escalate (if the
 * witness has been traumatized).
 *
 * v0.50 adds a per-agent ExposureLog at bots/<name>/habituation.json,
 * with time-decayed exposure counts. exposureFactor() returns a
 * multiplier in roughly [0.3, 1.5] applied AT THE WITNESS'S END to the
 * affect magnitude — and thus, indirectly, to the belief delta.
 *
 * Background reading: Kandel (2001) "The molecular biology of memory
 * storage: a dialogue between genes and synapses" (Nobel lecture);
 * Groves & Thompson (1970) "Habituation: a dual-process theory";
 * Rankin et al. (2009) "Habituation revisited".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BOTS_DIR = './bots';
const FILE = 'habituation.json';

const HALF_LIFE_SEC = 1800;        // 30-minute decay; tuned for game-session timescales
const MAX_EXPOSURES_PER_KEY = 20;  // bound per (event type) tuple

// Tunable curve parameters. Floors and ceilings prevent runaway in either
// direction even with hundreds of exposures.
const HABITUATION_FLOOR   = 0.3;   // minimum response after heavy habituation
const HABITUATION_RATE    = 0.4;   // exponential decay rate per effective count
const SENSITIZATION_CEIL  = 1.5;   // maximum response after heavy sensitization
const SENSITIZATION_RATE  = 0.3;
const LOW_AROUSAL_THRESHOLD  = 0.4;
const HIGH_AROUSAL_THRESHOLD = 0.7;

/**
 * Record an exposure event for one witness. Returns the multiplier that
 * should be applied to that witness's affect magnitude FOR THIS event.
 *
 * NOTE: factor is computed BEFORE the new exposure is added — i.e. it
 * reflects how strongly the agent reacts to this NEW occurrence, given
 * everything they have experienced up until now. This matches the
 * neurobiology: response to stimulus N is shaped by exposures 1..N-1.
 *
 * @param {string} witness
 * @param {string} eventType
 * @param {number} arousal     - the affect.arousal of this event
 * @returns {number} multiplier in roughly [HABITUATION_FLOOR, SENSITIZATION_CEIL]
 */
export function recordExposure(witness, eventType, arousal) {
    if (!witness || !eventType) return 1.0;
    const data = _load(witness);
    const now = Date.now();
    const key = String(eventType);
    const list = data.byEvent[key] || [];

    const effectiveCount = _effectiveCount(list, now);
    const factor = _curve(effectiveCount, arousal);

    list.push({ at: now, arousal: typeof arousal === 'number' ? arousal : 0 });
    if (list.length > MAX_EXPOSURES_PER_KEY) {
        list.splice(0, list.length - MAX_EXPOSURES_PER_KEY);
    }
    data.byEvent[key] = list;
    _save(witness, data);
    return factor;
}

/**
 * Read-only: compute the factor that WOULD apply if this witness saw
 * this event right now — without recording an exposure. Useful for
 * preview / inspector / tests.
 */
export function exposureFactor(witness, eventType, arousal) {
    if (!witness || !eventType) return 1.0;
    const data = _load(witness);
    const now = Date.now();
    const list = data.byEvent[eventType] || [];
    const effectiveCount = _effectiveCount(list, now);
    return _curve(effectiveCount, arousal);
}

/**
 * Diagnostic. Returns the curve's classification, the effective count,
 * and the resulting multiplier with reasoning.
 */
export function explainExposure(witness, eventType, arousal) {
    const data = _load(witness);
    const now = Date.now();
    const list = data.byEvent[eventType] || [];
    const effectiveCount = _effectiveCount(list, now);
    const factor = _curve(effectiveCount, arousal);
    let mode;
    if (typeof arousal !== 'number' || arousal < LOW_AROUSAL_THRESHOLD) mode = 'habituating';
    else if (arousal >= HIGH_AROUSAL_THRESHOLD) mode = 'sensitizing';
    else mode = 'neutral';

    return {
        mode,
        effectiveCount: Math.round(effectiveCount * 100) / 100,
        factor: Math.round(factor * 100) / 100,
        reason: mode === 'habituating'
            ? `low-arousal ${eventType} — repetition dulls response`
            : mode === 'sensitizing'
                ? `high-arousal ${eventType} — repetition heightens response`
                : `mid-arousal ${eventType} — repetition neutral`
    };
}

/**
 * Test/setup helper: clear all habituation state for an agent.
 */
export function _clearHabituation(witness) {
    const path = _path(witness);
    if (existsSync(path)) {
        try { writeFileSync(path, JSON.stringify({ version: 1, byEvent: {} }, null, 2)); }
        catch { /* nonfatal */ }
    }
}

// ────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────

function _path(witness) { return join(BOTS_DIR, witness, FILE); }

function _load(witness) {
    const path = _path(witness);
    if (!existsSync(path)) return { version: 1, byEvent: {} };
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        if (!raw.byEvent) raw.byEvent = {};
        return raw;
    } catch {
        return { version: 1, byEvent: {} };
    }
}

function _save(witness, data) {
    try {
        const dir = join(BOTS_DIR, witness);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(_path(witness), JSON.stringify(data, null, 2));
    } catch (e) {
        console.warn(`[HABITUATION] Failed to save for ${witness}: ${e.message}`);
    }
}

/**
 * Time-decayed effective count. Each exposure contributes exp(-Δt/halfLife*ln2);
 * recent exposures count fully, hour-old ones are halved, etc.
 */
function _effectiveCount(list, now) {
    let total = 0;
    const lambda = Math.log(2) / HALF_LIFE_SEC;
    for (const e of list) {
        const elapsedSec = (now - e.at) / 1000;
        if (elapsedSec < 0) total += 1;          // clock skew safety
        else total += Math.exp(-lambda * elapsedSec);
    }
    return total;
}

/**
 * Convert (effectiveCount, arousal) → multiplier. count=0 always → 1.0
 * because we compute the factor BEFORE recording the new exposure, so
 * the very first time always uses the unmodified affect.
 */
function _curve(effectiveCount, arousal) {
    if (effectiveCount <= 0) return 1.0;
    if (typeof arousal !== 'number' || Number.isNaN(arousal)) arousal = 0;

    if (arousal < LOW_AROUSAL_THRESHOLD) {
        // Habituation — decay from 1.0 toward HABITUATION_FLOOR.
        // factor = floor + (1-floor) * exp(-rate * count)
        const factor = HABITUATION_FLOOR
            + (1 - HABITUATION_FLOOR) * Math.exp(-HABITUATION_RATE * effectiveCount);
        return _clamp(factor, HABITUATION_FLOOR, 1.0);
    }
    if (arousal >= HIGH_AROUSAL_THRESHOLD) {
        // Sensitization — climb from 1.0 toward SENSITIZATION_CEIL.
        // factor = 1 + (ceil-1) * (1 - exp(-rate * count))
        const factor = 1 + (SENSITIZATION_CEIL - 1) * (1 - Math.exp(-SENSITIZATION_RATE * effectiveCount));
        return _clamp(factor, 1.0, SENSITIZATION_CEIL);
    }
    // Mid-arousal — no curve.
    return 1.0;
}

function _clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}
