/**
 * Tests for v0.86 — central cognitive-timescales index.
 *
 * The module re-exports canonical constants from each substrate layer's
 * own module. Tests confirm:
 *   - exported values match the source-of-truth modules (no drift)
 *   - asReport() returns a non-empty multi-line string mentioning each
 *     layer's name (so a future doc-render or inspector can rely on it)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALLOSTATIC_LOAD_RATE, ALLOSTATIC_OVERLOADED,
    HABITUATION_FLOOR, SENSITIZATION_CEIL,
    WM_CAP_BASELINE, WM_CAP_OVERLOADED,
    AFFECT_LOG_CAP_ENTRIES, MOOD_WINDOW_LAST_N,
    CONSOLIDATION_TOP_N,
    MOOD_NEUTRAL_BAND, MOOD_DISSONANT_DISCOUNT, FLASHBULB_OVERRIDE_THRESHOLD,
    DISSONANCE_NEGATIVE_THRESHOLD, DISSONANCE_STRONG_MAGNITUDE,
    PRIDE_POSITIVE_THRESHOLD, PRIDE_STRONG_MAGNITUDE,
    SOMATIC_AMPLIFICATION_CAP, SOMATIC_COLLISION_WEIGHT,
    SURPRISE_SCALE_FACTOR, SURPRISE_MAX_MULTIPLIER,
    VICARIOUS_TRUST_THRESHOLD,
    OPTIMISM_THRESHOLD, OPTIMISM_BONUS, OPTIMISM_DAMP,
    DMN_MUSINGS_BYTE_CAP,
    asReport
} from '../core/cognition/timescales.js';
import { _THRESHOLDS as ALLO } from '../core/cognition/allostatic_load.js';
import { _CONSTANTS as DIS } from '../core/cognition/dissonance.js';
import { _CONSTANTS as OPT } from '../core/cognition/optimism.js';
import { _CONSTANTS as SOMATIC } from '../core/affect/somatic.js';
import { _CONSTANTS as SURPRISE } from '../core/affect/predictive.js';

test('allostatic constants re-exported match the source module', () => {
    assert.equal(ALLOSTATIC_LOAD_RATE, ALLO.LOAD_RATE);
    assert.equal(ALLOSTATIC_OVERLOADED, ALLO.OVERLOADED);
});

test('dissonance constants re-exported match the source module', () => {
    assert.equal(DISSONANCE_NEGATIVE_THRESHOLD, DIS.NEGATIVE_THRESHOLD);
    assert.equal(DISSONANCE_STRONG_MAGNITUDE, DIS.STRONG_MAGNITUDE);
});

test('v1.1.34: pride constants re-exported match the source module', () => {
    assert.equal(PRIDE_POSITIVE_THRESHOLD, DIS.POSITIVE_THRESHOLD);
    assert.equal(PRIDE_STRONG_MAGNITUDE, DIS.PRIDE_STRONG_MAGNITUDE);
});

test('v1.1.34: somatic constants re-exported match the source module', () => {
    assert.equal(SOMATIC_AMPLIFICATION_CAP, SOMATIC.SOMATIC_AMPLIFICATION_CAP);
    assert.equal(SOMATIC_COLLISION_WEIGHT, SOMATIC.COLLISION_WEIGHT);
});

test('v1.1.34: surprise constants re-exported match the source module', () => {
    assert.equal(SURPRISE_SCALE_FACTOR, SURPRISE.SURPRISE_SCALE_FACTOR);
    assert.equal(SURPRISE_MAX_MULTIPLIER, SURPRISE.SURPRISE_MAX_MULTIPLIER);
});

test('optimism constants re-exported match the source module', () => {
    assert.equal(OPTIMISM_THRESHOLD, OPT.OPTIMISM_THRESHOLD);
    assert.equal(OPTIMISM_BONUS, OPT.ASYMMETRY_BONUS);
    assert.equal(OPTIMISM_DAMP, OPT.ASYMMETRY_DAMP);
});

test('working-memory caps are monotonically descending', () => {
    assert.ok(WM_CAP_BASELINE > WM_CAP_OVERLOADED);
    assert.ok(WM_CAP_OVERLOADED >= 1);
});

test('habituation curves bracket the unity multiplier', () => {
    assert.ok(HABITUATION_FLOOR > 0 && HABITUATION_FLOOR < 1);
    assert.ok(SENSITIZATION_CEIL > 1);
});

test('mood-congruent thresholds are sane', () => {
    assert.ok(MOOD_NEUTRAL_BAND > 0 && MOOD_NEUTRAL_BAND < 1);
    assert.ok(MOOD_DISSONANT_DISCOUNT > 0 && MOOD_DISSONANT_DISCOUNT < 1);
    assert.ok(FLASHBULB_OVERRIDE_THRESHOLD > MOOD_DISSONANT_DISCOUNT);
});

test('vicarious gate is in [0, 1]', () => {
    assert.ok(VICARIOUS_TRUST_THRESHOLD > 0 && VICARIOUS_TRUST_THRESHOLD < 1);
});

test('asReport renders a non-empty report mentioning each layer', () => {
    const r = asReport();
    assert.ok(r.length > 200);
    assert.match(r, /Allostatic/);
    assert.match(r, /Habituation/);
    assert.match(r, /Working memory/);
    assert.match(r, /Vicarious/);
    assert.match(r, /dissonance/i);
    assert.match(r, /DMN/);
    assert.match(r, /flashbulb/);
    assert.match(r, /Optimism/i);
    // v1.1.34: pride, somatic, surprise must also appear
    assert.match(r, /pride/i);
    assert.match(r, /Somatic/i);
    assert.match(r, /surprise/i);
});

test('all referenced constants are numeric', () => {
    for (const v of [
        ALLOSTATIC_LOAD_RATE, HABITUATION_FLOOR, SENSITIZATION_CEIL,
        WM_CAP_BASELINE, WM_CAP_OVERLOADED, AFFECT_LOG_CAP_ENTRIES,
        MOOD_WINDOW_LAST_N, CONSOLIDATION_TOP_N, MOOD_NEUTRAL_BAND,
        MOOD_DISSONANT_DISCOUNT, FLASHBULB_OVERRIDE_THRESHOLD,
        DISSONANCE_NEGATIVE_THRESHOLD, DISSONANCE_STRONG_MAGNITUDE,
        PRIDE_POSITIVE_THRESHOLD, PRIDE_STRONG_MAGNITUDE,
        SOMATIC_AMPLIFICATION_CAP, SOMATIC_COLLISION_WEIGHT,
        SURPRISE_SCALE_FACTOR, SURPRISE_MAX_MULTIPLIER,
        VICARIOUS_TRUST_THRESHOLD, DMN_MUSINGS_BYTE_CAP
    ]) {
        assert.equal(typeof v, 'number');
        assert.ok(!Number.isNaN(v));
    }
});
