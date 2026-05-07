/**
 * Predictive Coding — surprise drives learning faster than confirmation.
 *
 * Real neuroscience: Karl Friston's free energy principle. The brain is
 * a prediction machine. We don't react to events as such — we react to
 * PREDICTION ERRORS. When something violates expectation, that's
 * "surprise" (Bayesian surprise, more technically), and surprise scales
 * the magnitude of the resulting update.
 *
 * A betrayal by a trusted ally hits trust harder than a betrayal by
 * someone already distrusted — because the model failed harder.
 * Conversely, a kindness from a long-feared rival reshapes belief faster
 * than the hundredth kindness from your closest friend.
 *
 * Anima up to v0.46 had affect-scaled belief updates (calm vs intense
 * events) but no model of HOW MUCH the update VIOLATED EXPECTATION.
 * That's a missing axis. This module fills it.
 *
 * Mechanism: when computing a belief delta for a witness,
 *   prior_trust = witness's current BeliefTable trust in the actor
 *   event_valence = the affect-tagged valence of the action
 *   surprise = max(0, -prior_trust × event_valence)
 *     (positive when prior and event point opposite ways — i.e. the
 *      model said positive and reality said negative, or vice versa)
 *   multiplier = 1 + min(1.0, surprise × 1.5)
 *     (no boost on confirmation, up to 2.5× on full surprise)
 *
 * Result: high-surprise events shift trust 1.5–2.5× harder than
 * confirmatory events of the same nominal magnitude.
 *
 * Background reading: Friston (2010) "The free-energy principle";
 * Schultz on dopamine + reward prediction error; Bar (2009)
 * "Predictions: a universal principle in the operation of the human
 * brain"; Clark "Surfing Uncertainty".
 */

// v1.1.34: extracted to module-level constants so the central
// timescales index can re-export them without re-typing the numbers.
const SURPRISE_SCALE_FACTOR     = 1.5;
const SURPRISE_MAX_MULTIPLIER   = 2.5;

/**
 * Compute the surprise multiplier for a belief update.
 *
 * @param {number} priorTrust   - witness's current trust in actor, [-1, 1]
 * @param {number} eventValence - affect valence of the event, [-1, 1]
 * @returns {number} multiplier in [1.0, 2.5] — apply to nominal delta
 */
export function surpriseScale(priorTrust, eventValence) {
    if (typeof priorTrust !== 'number' || typeof eventValence !== 'number') return 1.0;
    if (Number.isNaN(priorTrust) || Number.isNaN(eventValence)) return 1.0;
    if (priorTrust === 0 || eventValence === 0) return 1.0;     // no prior, no event, no surprise

    // product < 0 means signs disagree — model failed.
    const product = priorTrust * eventValence;
    if (product >= 0) return 1.0;     // confirmation; no boost

    // |product| in (0, 1]. Scale by 1.5 so a full reversal (trust=+1, event=-1)
    // gives multiplier 2.5×. Capped to avoid runaway updates.
    const surprise = Math.abs(product);
    return Math.min(SURPRISE_MAX_MULTIPLIER, 1 + surprise * SURPRISE_SCALE_FACTOR);
}

/**
 * Convenience: classify the surprise into a label for prompt injection
 * or logging. Useful for narrative output.
 */
export function surpriseLabel(priorTrust, eventValence) {
    const m = surpriseScale(priorTrust, eventValence);
    if (m < 1.05) return 'expected';
    if (m < 1.4) return 'mildly surprising';
    if (m < 1.9) return 'unsettling';
    return 'shocking';
}

/**
 * For diagnostic / inspector use: given a witness's BeliefTable entry +
 * an event's affect tag, return both the multiplier and a structured
 * report describing why.
 */
export function explainSurprise(priorTrust, eventValence) {
    const multiplier = surpriseScale(priorTrust, eventValence);
    const label = surpriseLabel(priorTrust, eventValence);
    let reason;
    if (priorTrust === 0 || eventValence === 0) {
        reason = 'no prior expectation OR neutral event';
    } else if (priorTrust * eventValence >= 0) {
        reason = priorTrust > 0
            ? `model held: trusted ally acted positively (or neutrally)`
            : `model held: distrusted other acted negatively (or neutrally)`;
    } else {
        reason = priorTrust > 0
            ? `MODEL FAILED: trusted ally acted negatively (betrayal of expectation)`
            : `MODEL FAILED: distrusted rival acted positively (unexpected grace)`;
    }
    return { multiplier, label, reason };
}

/**
 * v1.1.34: expose the tunables for the central timescales index.
 */
export const _CONSTANTS = Object.freeze({
    SURPRISE_SCALE_FACTOR,
    SURPRISE_MAX_MULTIPLIER
});
