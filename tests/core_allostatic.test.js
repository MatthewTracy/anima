/**
 * Tests for core/cognition/allostatic_load.js — McEwen-style stress reservoir.
 *
 * Confirms:
 *   - record + read round-trip
 *   - decay reduces load
 *   - accumulation across many events approaches the cap (1.0)
 *   - stressLevel labels match thresholds
 *   - asPromptText returns appropriate marker per level
 *   - integration: applying many events bumps stress organically
 *   - DMN: overloaded state replaces mood opener with overloaded line
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import {
    recordStress, decayStress, getStress, stressLevel,
    asPromptText, _THRESHOLDS, _clearStress
} from '../core/cognition/allostatic_load.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { ruminate } from '../core/cognition/dmn.js';
import { _resetFactionCache } from '../core/identity/faction.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';

const NAMES = ['_TestAllA', '_TestAllB'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

test('recordStress + getStress round-trip', () => {
    const after = recordStress('_TestAllA', 0.5);
    assert.ok(after > 0, `expected positive load, got ${after}`);
    assert.equal(getStress('_TestAllA'), after);
});

test('zero-arousal events do not change load', () => {
    recordStress('_TestAllA', 0.5);
    const before = getStress('_TestAllA');
    recordStress('_TestAllA', 0);
    assert.equal(getStress('_TestAllA'), before);
});

test('load is clamped at 1.0', () => {
    for (let i = 0; i < 100; i++) recordStress('_TestAllA', 1.0);
    assert.ok(getStress('_TestAllA') <= 1.0);
});

test('decayStress reduces load multiplicatively', () => {
    recordStress('_TestAllA', 1.0);
    recordStress('_TestAllA', 1.0);
    const before = getStress('_TestAllA');
    decayStress('_TestAllA');
    const after = getStress('_TestAllA');
    assert.ok(after < before, `expected decay: ${before} → ${after}`);
});

test('stressLevel maps thresholds to labels', () => {
    assert.equal(stressLevel(0.05), 'baseline');
    assert.equal(stressLevel(_THRESHOLDS.ELEVATED + 0.01), 'elevated');
    assert.equal(stressLevel(_THRESHOLDS.ALLOSTATIC + 0.01), 'allostatic');
    assert.equal(stressLevel(_THRESHOLDS.OVERLOADED + 0.01), 'overloaded');
});

test('asPromptText returns baseline marker when rested', () => {
    const text = asPromptText('_TestAllA');
    assert.match(text, /rested|carry what comes/);
});

test('asPromptText returns overloaded marker when load is high', () => {
    for (let i = 0; i < 30; i++) recordStress('_TestAllA', 1.0);
    const text = asPromptText('_TestAllA');
    assert.match(text, /cannot sustain|overloaded/);
});

test('integration: applying high-arousal events accumulates stress organically', () => {
    const witness = '_TestAllA';
    const actor   = 'X';
    const target  = '_TestAllB';
    for (let i = 0; i < 5; i++) {
        applyEventToBeliefs({ type: 'attack_player', actor, target }, [witness, target]);
    }
    const load = getStress(witness);
    assert.ok(load > 0.05, `expected stress accumulation, got ${load}`);
});

test('integration: DMN uses overloaded opener once load exceeds threshold', () => {
    const witness = '_TestAllA';
    // Pre-load to overloaded
    for (let i = 0; i < 30; i++) recordStress(witness, 1.0);
    // Need at least one belief to make ruminate produce output beyond skip-empty
    new BeliefTable(witness).set('Y', +0.5, 'someone known');
    const m = ruminate(witness, { persist: false });
    assert.match(m, /past what it can hold|nervous system/);
});

test('integration: DMN at allostatic adds breath line under mood opener', () => {
    const witness = '_TestAllA';
    new BeliefTable(witness).set('Y', +0.6, 'companion');
    // Drive load to allostatic but NOT overloaded
    // each call: arousal=1.0 × LOAD_RATE=0.07 → +0.07 per call
    // need ~8 calls for 0.56, ~9 for 0.63
    for (let i = 0; i < 9; i++) recordStress(witness, 1.0);
    const level = stressLevel(getStress(witness));
    assert.equal(level, 'allostatic');
    const m = ruminate(witness, { persist: false });
    assert.match(m, /not had a clean breath/);
});
