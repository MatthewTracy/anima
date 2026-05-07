/**
 * Somatic Markers — value-aligned amplification of affect.
 *
 * Real neuroscience: Antonio Damasio's somatic-marker hypothesis (Damasio
 * 1994, "Descartes' Error"; 1996 lesion studies on ventromedial prefrontal
 * cortex). Decisions are biased BEFORE conscious deliberation by body-state
 * signals — the gut feel, the chest tightening, the heat in the face. These
 * markers are personal: a pacifist's body screams at violence in a way a
 * hardened soldier's does not. The same external event lands on different
 * nervous systems with different intensities, because each nervous system
 * has been wired by a different lifetime of value alignment.
 *
 * Anima up to v0.54 had homogeneous affect tagging — every agent reacted
 * to a flog with the same nominal valence + arousal, modified only by
 * role and individual history (habituation, surprise). What was missing:
 * the agent's PERSONALITY didn't shape how the event landed in the first
 * place. A monk who has spent a lifetime on the mercy axis should feel
 * a public flogging more sharply than one who has grown into the justice
 * axis. Our existing soul DNA already captures that personality vector
 * (loyalty/autonomy, mercy/justice, etc.). We just hadn't wired it into
 * affect.
 *
 * Mechanism: each event-type maps to one or more value AXES with signed
 * collisions (+1 = aligns with the positive end, -1 = aligns with the
 * negative end). For an agent with DNA vector D, the somatic boost is
 * the weighted sum of |dnaValue × eventCollision| — the more strongly
 * the event collides with a strongly-held value (in either direction),
 * the more arousal is amplified. Valence is preserved (we don't claim
 * a pacifist FEELS violence as positive — only that they feel it more).
 *
 * Result: the same flog now arouses a contemplative, mercy-leaning monk
 * harder than it arouses a justice-leaning, action-leaning one. The
 * heterogeneity that real brains bring to identical events is finally
 * present in the substrate.
 *
 * Background: Damasio (1994); Bechara & Damasio (2005) "The somatic-
 * marker hypothesis: a neural theory of economic decision"; Reimann &
 * Bechara (2010) "The somatic marker framework as a neurological theory
 * of decision-making".
 */

import { dnaOf } from '../dna/soul_dna.js';

/**
 * Per-event-type value-axis collisions. Each entry is a list of
 * { axis, sign } pairs. Sign is +1 if the event aligns with the
 * positive pole of that axis (named in soul_dna.js's AXES table),
 * -1 if it aligns with the opposite pole.
 *
 * Example: 'flog' collides with mercy/justice (sign=-1, pulls toward
 * "justice" pole) and with action/contemplation (sign=+1, an action).
 * A mercy-leaning agent (dna.mercy ≈ +0.8) will react harder to a flog
 * than a justice-leaning one (dna.mercy ≈ -0.6) — because their value
 * vector points AWAY from the act, the collision is sharper.
 */
const EVENT_AXIS_COLLISIONS = Object.freeze({
    // Combat / harm — collides with mercy and contemplation (action-pole).
    attack_player: [
        { axis: 'mercy',  sign: -1 },   // pulls toward justice/punishment pole
        { axis: 'action', sign: +1 }
    ],
    kill_player:   [
        { axis: 'mercy',  sign: -1 },
        { axis: 'action', sign: +1 }
    ],
    vent:          [
        { axis: 'mercy',  sign: -1 },
        { axis: 'action', sign: +1 },
        { axis: 'trust',  sign: -1 }    // ultimate breach of trust
    ],
    // Cloister / authority
    flog:          [
        { axis: 'mercy',  sign: -1 },
        { axis: 'tradition', sign: +1 }   // institutional discipline
    ],
    excommunicate: [
        { axis: 'mercy',  sign: -1 },
        { axis: 'loyalty', sign: -1 },    // severs from kin
        { axis: 'tradition', sign: +1 }
    ],
    accuse:        [
        { axis: 'trust',  sign: -1 },
        { axis: 'mercy',  sign: -1 }
    ],
    confess:       [
        { axis: 'trust',  sign: +1 },
        { axis: 'doubt',  sign: +1 }
    ],
    confess_burden: [
        { axis: 'trust',  sign: +1 },
        { axis: 'doubt',  sign: +1 }
    ],
    preach:        [
        { axis: 'tradition', sign: +1 },
        { axis: 'doubt',  sign: -1 }
    ],
    fast:          [
        { axis: 'tradition', sign: +1 },
        { axis: 'action', sign: -1 }
    ],
    writeScripture:[
        { axis: 'tradition', sign: +1 }
    ],
    lectio:        [
        { axis: 'action', sign: -1 }
    ],
    // Crew / loyalty
    mutiny_call:   [
        { axis: 'loyalty', sign: -1 },
        { axis: 'tradition', sign: -1 },
        { axis: 'action', sign: +1 }
    ],
    mutiny_succeed:[
        { axis: 'loyalty', sign: -1 },
        { axis: 'tradition', sign: -1 }
    ],
    divide_plunder:[
        { axis: 'loyalty', sign: +1 }
    ],
    brig:          [
        { axis: 'mercy',  sign: -1 }
    ],
    release:       [
        { axis: 'mercy',  sign: +1 }
    ],
    // Outpost / care
    repair:        [
        { axis: 'action', sign: +1 },
        { axis: 'loyalty', sign: +1 }     // tending to the shared vessel
    ],
    examine_crew:  [
        { axis: 'mercy',  sign: +1 }
    ],
    contain:       [
        { axis: 'action', sign: +1 },
        { axis: 'loyalty', sign: +1 }
    ],
    lockdown:      [
        { axis: 'mercy',  sign: -1 }
    ],
    // Cell / resistance
    sabotage:      [
        { axis: 'tradition', sign: -1 },
        { axis: 'action', sign: +1 }
    ],
    forge:         [
        { axis: 'tradition', sign: -1 },
        { axis: 'mercy',  sign: +1 }      // helping someone slip away
    ],
    expel:         [
        { axis: 'loyalty', sign: -1 },
        { axis: 'mercy',  sign: -1 }
    ],
    broke:         [
        { axis: 'loyalty', sign: -1 },
        { axis: 'trust',  sign: -1 }
    ],
    lay_low:       [
        { axis: 'action', sign: -1 }
    ]
});

const SOMATIC_AMPLIFICATION_CAP = 0.6;   // arousal can climb up to +60%
const COLLISION_WEIGHT = 0.35;           // each unit of |dna × sign| adds 35% before cap

/**
 * Compute the somatic arousal multiplier for an agent witnessing an event.
 * Returns 1.0 if no DNA, no mapping, or no collision strong enough to
 * amplify. Otherwise returns a value in (1, 1 + SOMATIC_AMPLIFICATION_CAP].
 *
 * The agent's DNA is the source of personalization; the EVENT_AXIS_COLLISIONS
 * table is the cross-population fact about what events touch what values.
 *
 * Sign of dna × sign:
 *   - large positive → event-pole and dna-pole are aligned → collision
 *     is mild (you expected this, you condone it; smaller boost)
 *   - large negative → dna points AWAY from where the event lands →
 *     collision is sharp (your values are being violated; bigger boost)
 *
 * We boost on the magnitude of *misalignment* (|dna - sign|/2 normalized),
 * not on alignment, because that's the somatic-marker prediction:
 * violations register harder than confirmations.
 */
export function somaticAmplify(agentName, eventType) {
    if (!agentName || !eventType) return 1.0;
    const collisions = EVENT_AXIS_COLLISIONS[eventType];
    if (!collisions || collisions.length === 0) return 1.0;
    const dna = dnaOf(agentName);
    if (!dna) return 1.0;

    // Misalignment magnitude: for each axis collision, the agent's
    // dna-on-that-axis vs. the event's sign on that axis. If signs
    // disagree (dna positive, sign negative or vice-versa), |dna - sign|
    // is large and contributes the most.
    let totalMisalign = 0;
    for (const c of collisions) {
        const d = dna[c.axis];
        if (typeof d !== 'number' || d === 0) continue;
        // Only the COMPONENT of dna that points opposite to sign contributes.
        // sign=+1, d=-0.8 → contributes 0.8.  sign=+1, d=+0.8 → contributes 0.
        // sign=-1, d=+0.7 → contributes 0.7.
        const opposing = (Math.sign(d) !== Math.sign(c.sign)) ? Math.abs(d) : 0;
        totalMisalign += opposing;
    }
    if (totalMisalign === 0) return 1.0;
    const boost = Math.min(SOMATIC_AMPLIFICATION_CAP, totalMisalign * COLLISION_WEIGHT);
    return 1 + boost;
}

/**
 * Diagnostic helper. Returns the multiplier and a human-readable reason
 * naming the strongest colliding axis.
 */
export function explainSomatic(agentName, eventType) {
    const collisions = EVENT_AXIS_COLLISIONS[eventType];
    const multiplier = somaticAmplify(agentName, eventType);
    if (!collisions || collisions.length === 0) {
        return { multiplier, reason: `no value collisions defined for ${eventType}` };
    }
    const dna = dnaOf(agentName) || {};
    let strongest = null;
    let strongestAbs = 0;
    for (const c of collisions) {
        const d = dna[c.axis] || 0;
        if (Math.sign(d) !== Math.sign(c.sign) && Math.abs(d) > strongestAbs) {
            strongest = c;
            strongestAbs = Math.abs(d);
        }
    }
    if (!strongest) {
        return { multiplier, reason: `${eventType} aligns with this agent's values — no boost` };
    }
    return {
        multiplier,
        reason: `${eventType} collides with the agent's ${strongest.axis} axis (×${multiplier.toFixed(2)})`
    };
}

/**
 * Test-only: expose the table for verification.
 */
export const _COLLISIONS = EVENT_AXIS_COLLISIONS;

/**
 * v1.1.34: expose the tunables for the central timescales index.
 */
export const _CONSTANTS = Object.freeze({
    SOMATIC_AMPLIFICATION_CAP,
    COLLISION_WEIGHT
});
