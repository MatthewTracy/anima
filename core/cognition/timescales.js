/**
 * Cognitive Timescales — central index of every decay rate, half-life,
 * and capacity constant the substrate uses.
 *
 * Why centralize: as the substrate grew to twelve layers, the constants
 * that govern HOW FAST each one changes ended up sprinkled across six
 * modules. A future tuning pass — or a future scenario that wants
 * shorter game-windows — needs ONE place to inspect them.
 *
 * This module re-exports (does NOT redefine) the canonical constants
 * from each layer's own module. Source of truth stays where the
 * mechanism lives; this is just an index for tooling and docs.
 *
 * Citations / why these numbers:
 *   - Allostatic LOAD_RATE 7%  / RECOVERY_RATE 3%: tuned so a 5–10
 *     event session reaches "elevated" in a normal scenario, "overloaded"
 *     only under sustained acute exposure (matches McEwen's clinical
 *     load timescales scaled to game-minutes).
 *   - Habituation HALF_LIFE_SEC 1800 (30 min): tuned for game-session
 *     timescales — within one game, exposures count fully; across
 *     games, they fade. (Aplysia experiments use seconds; we use
 *     minutes because game events are spaced human-perceptibly.)
 *   - AffectLog cap 60 entries: ~ Miller × 8 — comfortably above any
 *     single game's salient-events count, but bounded so the file
 *     doesn't grow unbounded across many games.
 *   - Working-memory cap 9 (baseline) → 3 (overloaded): Miller 7±2
 *     upper bound, narrowing per Easterbrook 1959.
 *   - Mood window: last 10 entries — tight enough to track recent arc,
 *     loose enough not to oscillate per event.
 */

import { _THRESHOLDS as ALLO_THRESHOLDS } from './allostatic_load.js';
import { _CONSTANTS as DISSONANCE_CONSTANTS } from './dissonance.js';
import { _CONSTANTS as OPTIMISM_CONSTANTS } from './optimism.js';
import { _CONSTANTS as SOMATIC_CONSTANTS } from '../affect/somatic.js';
import { _CONSTANTS as SURPRISE_CONSTANTS } from '../affect/predictive.js';

// ── Allostatic load (v0.56) ──────────────────────────────────────
export const ALLOSTATIC_LOAD_RATE       = ALLO_THRESHOLDS.LOAD_RATE;       // per-event additive
export const ALLOSTATIC_RECOVERY_RATE   = ALLO_THRESHOLDS.RECOVERY_RATE;   // per-tick multiplicative decay
export const ALLOSTATIC_ELEVATED        = ALLO_THRESHOLDS.ELEVATED;        // 0.35
export const ALLOSTATIC_LEVEL_THRESHOLD = ALLO_THRESHOLDS.ALLOSTATIC;      // 0.55
export const ALLOSTATIC_OVERLOADED      = ALLO_THRESHOLDS.OVERLOADED;      // 0.70

// ── Habituation / sensitization (v0.50) ──────────────────────────
export const HABITUATION_HALF_LIFE_SEC = 1800;    // canonical: 30 min decay; matches habituation.js
export const HABITUATION_FLOOR         = 0.30;
export const SENSITIZATION_CEIL        = 1.50;

// ── Working memory caps (v0.67 + v0.73 narrowing) ────────────────
export const WM_CAP_BASELINE   = 9;
export const WM_CAP_ELEVATED   = 7;
export const WM_CAP_ALLOSTATIC = 5;
export const WM_CAP_OVERLOADED = 3;

// ── Affect log (v0.45 / v0.46) ───────────────────────────────────
export const AFFECT_LOG_CAP_ENTRIES   = 60;       // per agent, per game
export const AFFECT_NEAR_ZERO_FLOOR   = 0.02;     // entries below this are skipped
export const MOOD_WINDOW_LAST_N       = 10;       // number of recent entries used by currentMood

// ── Memory consolidation (v0.46) ─────────────────────────────────
export const CONSOLIDATION_TOP_N      = 7;        // Miller's WM cap
export const CONSOLIDATION_THEME_THRESHOLD = 2;   // event types ≥ N times = recurring

// ── Mood-congruent retrieval (v0.52) + flashbulb (v0.76) ─────────
export const MOOD_NEUTRAL_BAND          = 0.10;
export const MOOD_DISSONANT_DISCOUNT    = 0.40;
export const FLASHBULB_OVERRIDE_THRESHOLD = 0.70;

// ── Dissonance (v0.74 / v0.78) + Pride (v1.1) ───────────────────
export const DISSONANCE_NEGATIVE_THRESHOLD = DISSONANCE_CONSTANTS.NEGATIVE_THRESHOLD;  // -0.30
export const DISSONANCE_STRONG_MAGNITUDE   = DISSONANCE_CONSTANTS.STRONG_MAGNITUDE;    //  0.55
export const PRIDE_POSITIVE_THRESHOLD      = DISSONANCE_CONSTANTS.POSITIVE_THRESHOLD;       // +0.30
export const PRIDE_STRONG_MAGNITUDE        = DISSONANCE_CONSTANTS.PRIDE_STRONG_MAGNITUDE;   //  0.40

// ── Somatic markers (v0.55 — Damasio) ────────────────────────────
export const SOMATIC_AMPLIFICATION_CAP = SOMATIC_CONSTANTS.SOMATIC_AMPLIFICATION_CAP;   // 0.60
export const SOMATIC_COLLISION_WEIGHT  = SOMATIC_CONSTANTS.COLLISION_WEIGHT;            // 0.35

// ── Predictive coding / surprise (v0.47 — Friston) ───────────────
export const SURPRISE_SCALE_FACTOR    = SURPRISE_CONSTANTS.SURPRISE_SCALE_FACTOR;       // 1.50
export const SURPRISE_MAX_MULTIPLIER  = SURPRISE_CONSTANTS.SURPRISE_MAX_MULTIPLIER;     // 2.50

// ── Optimism / pessimism bias (v0.93) ────────────────────────────
export const OPTIMISM_THRESHOLD = OPTIMISM_CONSTANTS.OPTIMISM_THRESHOLD;
export const OPTIMISM_BONUS     = OPTIMISM_CONSTANTS.ASYMMETRY_BONUS;
export const OPTIMISM_DAMP      = OPTIMISM_CONSTANTS.ASYMMETRY_DAMP;

// ── Vicarious affect (v0.53) ─────────────────────────────────────
export const VICARIOUS_TRUST_THRESHOLD = 0.4;
export const VICARIOUS_TARGET_SCALE    = 0.5;
export const VICARIOUS_ACTOR_SCALE     = 0.4;
export const VICARIOUS_AROUSAL_DAMP    = 0.7;

// ── DMN (v0.49 / v0.74) ──────────────────────────────────────────
export const DMN_MUSINGS_BYTE_CAP = 4000;

/**
 * Pretty-print all timescale constants for diagnostic / inspector use.
 */
export function asReport() {
    return [
        '=== ANIMA COGNITIVE TIMESCALES ===',
        '',
        '— Allostatic load (McEwen 1998)',
        `  add per event: ${ALLOSTATIC_LOAD_RATE}   recovery: ${ALLOSTATIC_RECOVERY_RATE}`,
        `  thresholds:    elevated ${ALLOSTATIC_ELEVATED}  allostatic ${ALLOSTATIC_LEVEL_THRESHOLD}  overloaded ${ALLOSTATIC_OVERLOADED}`,
        '',
        '— Habituation (Kandel 2001)',
        `  half-life:     ${HABITUATION_HALF_LIFE_SEC}s   floor: ${HABITUATION_FLOOR}   sensitization ceiling: ${SENSITIZATION_CEIL}`,
        '',
        '— Working memory (Miller 1956 + Easterbrook 1959)',
        `  caps by load:  baseline ${WM_CAP_BASELINE}  elevated ${WM_CAP_ELEVATED}  allostatic ${WM_CAP_ALLOSTATIC}  overloaded ${WM_CAP_OVERLOADED}`,
        '',
        '— Affect log',
        `  per-game cap:  ${AFFECT_LOG_CAP_ENTRIES} entries   near-zero floor: ${AFFECT_NEAR_ZERO_FLOOR}   mood window: last ${MOOD_WINDOW_LAST_N}`,
        '',
        '— Consolidation (Born & Wilhelm 2012)',
        `  top-N kept:    ${CONSOLIDATION_TOP_N}   theme threshold: ${CONSOLIDATION_THEME_THRESHOLD}× repetition`,
        '',
        '— Mood-congruent retrieval (Bower 1981) + flashbulb (Brown & Kulik 1977)',
        `  neutral band:  ±${MOOD_NEUTRAL_BAND}   dissonant base: ${MOOD_DISSONANT_DISCOUNT}   flashbulb threshold: ${FLASHBULB_OVERRIDE_THRESHOLD}`,
        '',
        '— Cognitive dissonance (Festinger 1957) + symmetric pride (v1.1)',
        `  negative cut:  ${DISSONANCE_NEGATIVE_THRESHOLD}   strong-dissonant magnitude: ${DISSONANCE_STRONG_MAGNITUDE}`,
        `  positive cut:  +${PRIDE_POSITIVE_THRESHOLD}   strong-pride magnitude:    ${PRIDE_STRONG_MAGNITUDE}`,
        '',
        '— Somatic markers (Damasio 1994)',
        `  amplification cap: +${SOMATIC_AMPLIFICATION_CAP}   per-collision weight: ${SOMATIC_COLLISION_WEIGHT}`,
        '',
        '— Predictive-coding surprise (Friston 2010)',
        `  scale factor:  ${SURPRISE_SCALE_FACTOR}   max multiplier: ${SURPRISE_MAX_MULTIPLIER}`,
        '',
        '— Vicarious affect (Preston & de Waal 2002)',
        `  trust gate:    |${VICARIOUS_TRUST_THRESHOLD}|   target-scale: ${VICARIOUS_TARGET_SCALE}   actor-scale: ${VICARIOUS_ACTOR_SCALE}   arousal-damp: ${VICARIOUS_AROUSAL_DAMP}`,
        '',
        '— Optimism / pessimism (Sharot 2011)',
        `  trust-axis cut: |${OPTIMISM_THRESHOLD}|   bonus on favored direction: ${OPTIMISM_BONUS}   damp on disfavored: ${OPTIMISM_DAMP}`,
        '',
        '— DMN (Raichle 2001)',
        `  musings file:  ≤ ${DMN_MUSINGS_BYTE_CAP} bytes`,
        '',
        '=== END TIMESCALES ==='
    ].join('\n');
}
