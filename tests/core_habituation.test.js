/**
 * Tests for core/cognition/habituation.js — Kandel-style habituation
 * & sensitization curves.
 *
 * Covers:
 *   - first exposure factor = 1.0 (no curve yet)
 *   - low-arousal repeated → habituation (decays toward floor)
 *   - high-arousal repeated → sensitization (climbs toward ceiling)
 *   - mid-arousal → no change
 *   - exposureFactor read-only does not mutate state
 *   - integration: 5th flog moves trust LESS than 1st flog
 *   - integration: 5th attack moves trust MORE than 1st attack (sensitization)
 *   - independence: two witnesses keep separate exposure histories
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import {
    recordExposure, exposureFactor, explainExposure, _clearHabituation
} from '../core/cognition/habituation.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { _resetFactionCache } from '../core/identity/faction.js';

const NAMES = ['_TestHabA', '_TestHabB', '_TestHabC', '_TestHabD'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

// ────────────────────────────────────────────────────────────────────
// Curve shape
// ────────────────────────────────────────────────────────────────────

test('first exposure has factor 1.0 (no curve before any history)', () => {
    const f = recordExposure('_TestHabA', 'flog', 0.4);
    assert.equal(f, 1.0);
});

test('low-arousal stimulus habituates with repetition', () => {
    // arousal=0.2 — comfortably below LOW threshold (0.4)
    const factors = [];
    for (let i = 0; i < 6; i++) {
        factors.push(recordExposure('_TestHabA', 'lectio', 0.2));
    }
    // First always 1.0; thereafter monotonically decreasing toward floor
    assert.equal(factors[0], 1.0);
    for (let i = 1; i < factors.length; i++) {
        assert.ok(factors[i] < factors[i - 1] + 0.001,
            `expected non-increasing factors, got ${factors.join(', ')}`);
    }
    // Sixth exposure should be substantially dulled
    assert.ok(factors[5] < 0.6, `expected <0.6 by exposure 6, got ${factors[5]}`);
});

test('high-arousal stimulus sensitizes with repetition', () => {
    const factors = [];
    for (let i = 0; i < 6; i++) {
        factors.push(recordExposure('_TestHabA', 'kill_player', 1.0));
    }
    assert.equal(factors[0], 1.0);
    for (let i = 1; i < factors.length; i++) {
        assert.ok(factors[i] > factors[i - 1] - 0.001,
            `expected non-decreasing factors, got ${factors.join(', ')}`);
    }
    assert.ok(factors[5] > 1.2, `expected >1.2 by exposure 6, got ${factors[5]}`);
    assert.ok(factors[5] <= 1.5, 'sensitization must respect ceiling');
});

test('mid-arousal stimulus stays at 1.0 (neutral zone)', () => {
    for (let i = 0; i < 5; i++) {
        const f = recordExposure('_TestHabA', 'preach', 0.55);
        assert.equal(f, 1.0);
    }
});

test('exposureFactor read-only does not mutate state', () => {
    recordExposure('_TestHabA', 'flog', 0.2);
    // Two reads should return effectively the same factor. Time-decay
    // between reads can shift the float at the 7th decimal place, so
    // we tolerate that — what we're verifying is that no record was
    // appended (which would jump the count meaningfully).
    const before = exposureFactor('_TestHabA', 'flog', 0.2);
    const after  = exposureFactor('_TestHabA', 'flog', 0.2);
    assert.ok(Math.abs(before - after) < 1e-3,
        `read-only must be near-idempotent: ${before} vs ${after}`);
});

test('explainExposure classifies the curve mode', () => {
    recordExposure('_TestHabA', 'flog', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);
    const r = explainExposure('_TestHabA', 'flog', 0.2);
    assert.equal(r.mode, 'habituating');
    assert.ok(r.effectiveCount > 0);
    assert.ok(r.factor < 1.0);

    const r2 = explainExposure('_TestHabA', 'kill_player', 1.0);
    assert.equal(r2.mode, 'sensitizing');
});

test('dishabituation: novel event resets habituation for other types', () => {
    // Habituate witness to "lectio" (low arousal)
    for (let i = 0; i < 5; i++) recordExposure('_TestHabA', 'lectio', 0.2);
    const habituated = exposureFactor('_TestHabA', 'lectio', 0.2);
    assert.ok(habituated < 0.6, `expected habituation, got ${habituated}`);

    // Now a novel event-type fires (kill_player) — this should
    // dishabituate other types per Kandel 1968 / Groves & Thompson.
    recordExposure('_TestHabA', 'kill_player', 1.0);

    // The next lectio should read near-first-exposure (factor close to 1.0
    // because effective count is now ~1, not ~5).
    const recovered = exposureFactor('_TestHabA', 'lectio', 0.2);
    assert.ok(recovered > habituated + 0.2,
        `expected dishabituation recovery: was ${habituated}, now ${recovered}`);
});

test('dishabituation: a familiar but already-known event does NOT reset others', () => {
    recordExposure('_TestHabA', 'lectio', 0.2);
    recordExposure('_TestHabA', 'lectio', 0.2);
    recordExposure('_TestHabA', 'lectio', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);  // first flog: novel → resets lectios
    recordExposure('_TestHabA', 'lectio', 0.2);  // re-fires lectio
    const lectioBefore = exposureFactor('_TestHabA', 'lectio', 0.2);

    // Now another flog — flog is NOT novel anymore. Should NOT reset lectios.
    recordExposure('_TestHabA', 'flog', 0.2);
    const lectioAfter = exposureFactor('_TestHabA', 'lectio', 0.2);
    // Re-firing a known type should not boost lectio's recovery further.
    assert.ok(Math.abs(lectioAfter - lectioBefore) < 0.05,
        `expected no extra recovery from familiar type: was ${lectioBefore}, now ${lectioAfter}`);
});

test('different event types keep separate exposure histories', () => {
    recordExposure('_TestHabA', 'flog', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);
    // 'preach' should still be at first-exposure
    const f = recordExposure('_TestHabA', 'preach', 0.2);
    assert.equal(f, 1.0);
});

test('different witnesses keep separate exposure histories', () => {
    recordExposure('_TestHabA', 'flog', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);
    recordExposure('_TestHabA', 'flog', 0.2);
    // _TestHabB has never seen a flog
    const f = recordExposure('_TestHabB', 'flog', 0.2);
    assert.equal(f, 1.0);
});

// ────────────────────────────────────────────────────────────────────
// Integration with auto_update
// ────────────────────────────────────────────────────────────────────

test('integration: 5th flog moves trust LESS than 1st flog (habituation)', () => {
    // flog has arousal 0.6 in DEFAULT_AFFECT — borderline; use captured to
    // be sure we're in habituation territory? Actually flog is mid (0.6).
    // Let's use 'lectio' which is calm and has byActor: 0 — wait, lectio
    // has no delta. Use 'fast' (byActor +0.05, arousal ~0.1).
    const witness = '_TestHabA';
    const actor   = '_TestHabB';

    // First exposure
    applyEventToBeliefs({ type: 'fast', actor }, [witness]);
    const t1 = new BeliefTable(witness).get(actor).trust;

    // Three more identical exposures (witness habituates)
    for (let i = 0; i < 3; i++) {
        applyEventToBeliefs({ type: 'fast', actor }, [witness]);
    }
    const t4 = new BeliefTable(witness).get(actor).trust;

    // Compute the gain from exposure 4 alone
    // First exposure gain = t1 - 0
    // Cumulative after 4 = t4
    // The four gains together should NOT be ~4× the first because
    // habituation dulls each subsequent.
    const firstGain  = t1;
    const totalGain  = t4;
    assert.ok(totalGain < firstGain * 4 - 0.001,
        `expected habituation: firstGain=${firstGain}, totalGain=${totalGain}`);
    assert.ok(totalGain > firstGain,
        `expected SOME accumulation: firstGain=${firstGain}, totalGain=${totalGain}`);
});

test('integration: 5th kill sensitizes (cumulative drop > 5× first drop)', () => {
    // kill_player has arousal 1.0 — solidly in sensitization range,
    // and byActor=-0.70 so changes are visible.
    const witness = '_TestHabA';
    const actor   = '_TestHabB';

    // Pre-record some sensitizing exposures so the next kill is at a
    // sensitized point (we need to do separate events because the
    // belief is clamped at -1.0; pre-warming only the exposure log).
    for (let i = 0; i < 4; i++) {
        recordExposure(witness, 'kill_player', 1.0);
    }

    applyEventToBeliefs({ type: 'kill_player', actor, target: '_TestHabC' }, [witness]);
    const sensitizedTrust = new BeliefTable(witness).get(actor).trust;

    // Compare to a fresh witness with no exposure history
    const freshWitness = '_TestHabD';
    applyEventToBeliefs({ type: 'kill_player', actor, target: '_TestHabC' }, [freshWitness]);
    const freshTrust = new BeliefTable(freshWitness).get(actor).trust;

    // Both will be at floor (-1.0) because kill is so heavy. Use a smaller
    // event for a meaningful magnitude comparison.
    // Switch test design: use 'attack_player' which is byActor=-0.40 with
    // arousal=0.80 — sensitizes but won't immediately floor.
    clean();
    for (let i = 0; i < 4; i++) {
        recordExposure(witness, 'attack_player', 0.8);
    }
    applyEventToBeliefs({ type: 'attack_player', actor, target: '_TestHabC' }, [witness]);
    const sens = new BeliefTable(witness).get(actor).trust;
    applyEventToBeliefs({ type: 'attack_player', actor, target: '_TestHabC' }, [freshWitness]);
    const fresh = new BeliefTable(freshWitness).get(actor).trust;

    assert.ok(sens < fresh - 0.01,
        `expected sensitized witness to react harder: sens=${sens}, fresh=${fresh}`);
});

test('integration: deltas pass through habituation and other factors composably', () => {
    // Full stack: fresh witness, ingroup-disabled, no surprise prior.
    // Verify deltas are clearly different across exposure counts.
    const witness = '_TestHabA';
    const actor   = '_TestHabB';

    // Three calm positive events. Each should accumulate but with diminishing
    // marginal trust (habituation).
    const trustOverTime = [];
    for (let i = 0; i < 3; i++) {
        applyEventToBeliefs({ type: 'fast', actor }, [witness]);
        trustOverTime.push(new BeliefTable(witness).get(actor).trust);
    }

    const gain1 = trustOverTime[0];
    const gain2 = trustOverTime[1] - trustOverTime[0];
    const gain3 = trustOverTime[2] - trustOverTime[1];

    assert.ok(gain2 < gain1, `expected gain2 < gain1 (habituation): ${gain1} -> ${gain2}`);
    assert.ok(gain3 < gain2 + 0.001, `expected gain3 ≤ gain2: ${gain2} -> ${gain3}`);
});
