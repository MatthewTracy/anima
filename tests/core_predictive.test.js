/**
 * Tests for core/affect/predictive.js — Friston-style surprise scaling.
 *
 * Predictive coding: prediction errors drive learning faster than
 * confirmation. We test:
 *   - confirmation (signs match) gives no boost
 *   - reversal (signs disagree) gives 1.5–2.5× boost scaled by magnitude
 *   - boundary cases (zero prior, zero event, NaN inputs) collapse to 1.0
 *   - integration with auto_update: surprising belief updates are larger
 *     than confirming ones for the same nominal event magnitude.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { surpriseScale, surpriseLabel, explainSurprise } from '../core/affect/predictive.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';

const NAMES = [
    '_TestPredA', '_TestPredB', '_TestPredC', '_TestPredD',
    '_TestPredActor', '_TestPredVillain', '_TestPredOutsider'
];

function clean() {
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

// ────────────────────────────────────────────────────────────────────
// surpriseScale — pure-math tests
// ────────────────────────────────────────────────────────────────────

test('confirmation (signs match) gives no boost', () => {
    // trusted ally acts positively — model held
    assert.equal(surpriseScale(+0.8, +0.7), 1.0);
    // distrusted other acts negatively — model held
    assert.equal(surpriseScale(-0.6, -0.5), 1.0);
});

test('full reversal (trust=+1, event=-1) gives the cap', () => {
    const m = surpriseScale(+1.0, -1.0);
    assert.equal(m, 2.5, 'expected 2.5× cap on full reversal');
});

test('full reversal in the other direction also caps', () => {
    const m = surpriseScale(-1.0, +1.0);
    assert.equal(m, 2.5);
});

test('partial reversal scales linearly with product magnitude', () => {
    // prior=+0.5, event=-0.5 → product=-0.25 → multiplier=1+0.25*1.5=1.375
    const m = surpriseScale(+0.5, -0.5);
    assert.ok(Math.abs(m - 1.375) < 1e-9, `expected ≈1.375, got ${m}`);
});

test('zero prior → no surprise (1.0)', () => {
    assert.equal(surpriseScale(0, +0.7), 1.0);
    assert.equal(surpriseScale(0, -0.7), 1.0);
});

test('zero event valence → no surprise (1.0)', () => {
    assert.equal(surpriseScale(+0.7, 0), 1.0);
    assert.equal(surpriseScale(-0.7, 0), 1.0);
});

test('non-numeric inputs collapse to 1.0', () => {
    assert.equal(surpriseScale('foo', 0.5), 1.0);
    assert.equal(surpriseScale(0.5, null), 1.0);
    assert.equal(surpriseScale(undefined, undefined), 1.0);
    assert.equal(surpriseScale(NaN, 0.5), 1.0);
});

test('label thresholds map cleanly', () => {
    assert.equal(surpriseLabel(+0.8, +0.5), 'expected');           // confirmation
    assert.equal(surpriseLabel(+0.2, -0.4), 'mildly surprising');  // small reversal → ~1.12
    assert.equal(surpriseLabel(+0.6, -0.7), 'unsettling');         // ~1.63
    assert.equal(surpriseLabel(+1.0, -1.0), 'shocking');           // 2.5
});

test('explainSurprise produces a structured diagnostic', () => {
    const r = explainSurprise(+0.8, -0.6);
    assert.ok(r.multiplier > 1);
    assert.match(r.reason, /MODEL FAILED.*betrayal/);
    assert.equal(r.label, 'unsettling');

    const r2 = explainSurprise(-0.7, +0.7);
    assert.match(r2.reason, /unexpected grace/);

    const r3 = explainSurprise(0, 0.5);
    assert.match(r3.reason, /no prior/);

    const r4 = explainSurprise(+0.5, +0.5);
    assert.match(r4.reason, /model held/);
});

// ────────────────────────────────────────────────────────────────────
// Integration — surprise actually scales BeliefTable updates
// ────────────────────────────────────────────────────────────────────

test('integration: betrayal by trusted ally moves trust harder than from neutral', () => {
    // Two witnesses see the SAME event from the SAME actor.
    // Witness A starts with high prior trust in actor.
    // Witness B starts with neutral prior trust.
    // After a hostile act, A's drop should be larger in magnitude than B's.
    const witnessA = '_TestPredA';
    const witnessB = '_TestPredB';
    const actor = '_TestPredActor';
    const target = '_TestPredC';

    new BeliefTable(witnessA).set(actor, +0.9, 'long history of loyalty');
    // witnessB: leave neutral (trust=0)

    const event = { type: 'attack_player', actor, target };
    applyEventToBeliefs(event, [witnessA, witnessB, target]);

    const aTrust = new BeliefTable(witnessA).get(actor).trust;
    const bTrust = new BeliefTable(witnessB).get(actor).trust;

    // Both should drop, but A's drop (from +0.9) should reflect the surprise
    // multiplier. Compare deltas, not absolute trust, since A started higher.
    const aDelta = aTrust - 0.9;
    const bDelta = bTrust - 0.0;

    assert.ok(aDelta < bDelta - 0.01,
        `expected betrayed-ally to move further than neutral: aDelta=${aDelta}, bDelta=${bDelta}`);
});

test('integration: confirmatory act (distrusted other behaves badly) gets no boost', () => {
    // Witness already distrusts actor. Actor does something hostile.
    // The drop should equal the no-surprise baseline (no extra boost).
    const witnessA = '_TestPredA';   // distrusts actor
    const witnessB = '_TestPredB';   // neutral
    const actor = '_TestPredVillain';
    const target = '_TestPredC';

    // Use a moderate prior so the clamp at -1.0 doesn't truncate the delta
    // and mask whether surprise scaling fired.
    new BeliefTable(witnessA).set(actor, -0.3, 'already wary');

    const event = { type: 'flog', actor, target };
    applyEventToBeliefs(event, [witnessA, witnessB, target]);

    const aTrust = new BeliefTable(witnessA).get(actor).trust;
    const bTrust = new BeliefTable(witnessB).get(actor).trust;

    const aDelta = aTrust - (-0.3);
    const bDelta = bTrust - 0.0;

    // Both deltas should be roughly equal (within rounding) — no surprise boost
    // for confirmation.
    assert.ok(Math.abs(aDelta - bDelta) < 0.01,
        `expected confirmation to match neutral baseline: aDelta=${aDelta}, bDelta=${bDelta}`);
});

test('integration: unexpected grace from feared rival lifts trust harder than from neutral', () => {
    // Mirror image: distrusted other does something positive.
    const witnessA = '_TestPredA';   // distrusts actor strongly
    const witnessB = '_TestPredB';   // neutral
    const actor = '_TestPredOutsider';
    const target = '_TestPredC';

    new BeliefTable(witnessA).set(actor, -0.8, 'long-standing fear');

    // Use 'repair' (positive valence per affect map: byActor=+0.10)
    const event = { type: 'repair', actor };
    applyEventToBeliefs(event, [witnessA, witnessB, target]);

    const aTrust = new BeliefTable(witnessA).get(actor).trust;
    const bTrust = new BeliefTable(witnessB).get(actor).trust;

    const aDelta = aTrust - (-0.8);
    const bDelta = bTrust - 0.0;

    // A's positive bump should exceed B's because A's prior was strongly
    // wrong about actor.
    assert.ok(aDelta > bDelta + 0.005,
        `expected unexpected-grace to move further than neutral: aDelta=${aDelta}, bDelta=${bDelta}`);
});
