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
    VICARIOUS_TRUST_THRESHOLD,
    DMN_MUSINGS_BYTE_CAP,
    asReport
} from '../core/cognition/timescales.js';
import { _THRESHOLDS as ALLO } from '../core/cognition/allostatic_load.js';
import { _CONSTANTS as DIS } from '../core/cognition/dissonance.js';

test('allostatic constants re-exported match the source module', () => {
    assert.equal(ALLOSTATIC_LOAD_RATE, ALLO.LOAD_RATE);
    assert.equal(ALLOSTATIC_OVERLOADED, ALLO.OVERLOADED);
});

test('dissonance constants re-exported match the source module', () => {
    assert.equal(DISSONANCE_NEGATIVE_THRESHOLD, DIS.NEGATIVE_THRESHOLD);
    assert.equal(DISSONANCE_STRONG_MAGNITUDE, DIS.STRONG_MAGNITUDE);
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
});

test('all referenced constants are numeric', () => {
    for (const v of [
        ALLOSTATIC_LOAD_RATE, HABITUATION_FLOOR, SENSITIZATION_CEIL,
        WM_CAP_BASELINE, WM_CAP_OVERLOADED, AFFECT_LOG_CAP_ENTRIES,
        MOOD_WINDOW_LAST_N, CONSOLIDATION_TOP_N, MOOD_NEUTRAL_BAND,
        MOOD_DISSONANT_DISCOUNT, FLASHBULB_OVERRIDE_THRESHOLD,
        DISSONANCE_NEGATIVE_THRESHOLD, DISSONANCE_STRONG_MAGNITUDE,
        VICARIOUS_TRUST_THRESHOLD, DMN_MUSINGS_BYTE_CAP
    ]) {
        assert.equal(typeof v, 'number');
        assert.ok(!Number.isNaN(v));
    }
});
