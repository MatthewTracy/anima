/**
 * Optimism / pessimism bias — asymmetric updating of positive vs negative
 * evidence based on the agent's personality.
 *
 * Real neuroscience: Tali Sharot's work (Sharot 2011 "The optimism bias";
 * Sharot, Korn & Dolan 2011 "How unrealistic optimism is maintained in
 * the face of reality"). Healthy optimists update their beliefs MORE
 * from positive prediction errors and LESS from negative ones. The
 * effect persists in fMRI: ventromedial prefrontal cortex tracks
 * expectation revision asymmetrically.
 *
 * This is NOT the same as:
 *   - Somatic markers (v0.55): personality-driven arousal amplification
 *     based on event-axis collisions
 *   - Friston surprise (v0.47): sign-disagreement amplification
 *     symmetric in both directions
 *
 * Optimism is direction-specific: positive deltas vs negative deltas
 * land asymmetrically depending on whether the witness's value-DNA
 * trust axis points toward open trust or guarded suspicion.
 *
 * Mechanism: read soul DNA's trust axis.
 *   trust ≥ +OPTIMISM_THRESHOLD  → optimist:
 *     positive delta × (1 + bonus)  ;  negative delta × (1 - damp)
 *   trust ≤ -OPTIMISM_THRESHOLD  → pessimist:
 *     positive delta × (1 - damp)   ;  negative delta × (1 + bonus)
 *   else  → balanced, factor 1.0
 *
 * Composes with the other five per-event factors as a 6th multiplier.
 */

import { dnaOf } from '../dna/soul_dna.js';

const OPTIMISM_THRESHOLD = 0.4;
const ASYMMETRY_BONUS    = 0.15;   // 15% boost on the favored direction
const ASYMMETRY_DAMP     = 0.10;   // 10% reduction on the disfavored direction

/**
 * Compute the optimism/pessimism bias multiplier for a witness, given
 * the SIGNED direction of the belief delta about to be applied.
 *
 * @param {string} witnessName
 * @param {number} delta - the SIGNED nominal delta (positive or negative)
 * @returns {number} multiplier, typically in [0.85, 1.15], 1.0 if balanced
 */
export function optimismBias(witnessName, delta) {
    if (typeof delta !== 'number' || Number.isNaN(delta) || delta === 0) return 1.0;
    if (!witnessName) return 1.0;
    const dna = dnaOf(witnessName);
    if (!dna || typeof dna.trust !== 'number') return 1.0;

    const trust = dna.trust;
    if (Math.abs(trust) < OPTIMISM_THRESHOLD) return 1.0;

    const positive = delta > 0;
    if (trust > 0) {
        // Optimist: positive deltas land harder, negative ones cushion.
        return positive ? 1.0 + ASYMMETRY_BONUS : 1.0 - ASYMMETRY_DAMP;
    } else {
        // Pessimist: negative deltas land harder, positive ones discount.
        return positive ? 1.0 - ASYMMETRY_DAMP : 1.0 + ASYMMETRY_BONUS;
    }
}

/**
 * Diagnostic: explain why a given multiplier was returned.
 */
export function explainOptimism(witnessName, delta) {
    const m = optimismBias(witnessName, delta);
    const dna = dnaOf(witnessName);
    if (!dna || typeof dna.trust !== 'number' || Math.abs(dna.trust) < OPTIMISM_THRESHOLD) {
        return { multiplier: m, reason: 'balanced trust axis — no optimism asymmetry' };
    }
    const role = dna.trust > 0 ? 'optimist' : 'pessimist';
    return {
        multiplier: m,
        reason: `${role} (trust axis ${dna.trust > 0 ? '+' : ''}${dna.trust.toFixed(2)}) on ${delta > 0 ? 'positive' : 'negative'} delta → ×${m.toFixed(2)}`
    };
}

export const _CONSTANTS = Object.freeze({
    OPTIMISM_THRESHOLD,
    ASYMMETRY_BONUS,
    ASYMMETRY_DAMP
});
