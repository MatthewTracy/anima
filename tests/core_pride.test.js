/**
 * Tests for v1.1 — pride detection (symmetric counterpart to dissonance).
 *
 * Pride: role='actor' entries with strongly positive valence — actions
 * YOU took that felt good to take. Without this, the substrate's
 * self-narrative was asymmetric (only brooding, never recognition).
 *
 * Dissonance still takes precedence when both fire — Festinger's
 * asymmetry: wrong-action sits in the body louder than right-action.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { ruminate } from '../core/cognition/dmn.js';
import { detectPride } from '../core/cognition/dissonance.js';

const NAME = '_TestPride';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

test('two positive-valence actor entries → loud pride', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'repair', actor: NAME }, 'actor');
    log.record({ type: 'repair', actor: NAME }, 'actor');
    const r = detectPride(NAME);
    assert.equal(r.level, 'loud');
});

test('one strong positive actor entry → soft pride', () => {
    const log = new AffectLog(NAME);
    // contain has valence +1.0, arousal 0.85 → magnitude 0.85
    log.record({ type: 'contain', actor: NAME }, 'actor');
    const r = detectPride(NAME);
    assert.equal(r.level, 'soft');
});

test('negative-valence actor entries do NOT trigger pride', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: NAME, target: 'X' }, 'actor');
    log.record({ type: 'attack_player', actor: NAME, target: 'Y' }, 'actor');
    const r = detectPride(NAME);
    assert.equal(r.level, 'none');
});

test('victim entries (role=target) ignored even when positive', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'repair', actor: 'Other', target: NAME }, 'target');
    log.record({ type: 'repair', actor: 'Other', target: NAME }, 'target');
    const r = detectPride(NAME);
    assert.equal(r.level, 'none');
});

test('DMN: loud pride surfaces as the proud line', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'repair', actor: NAME }, 'actor');
    log.record({ type: 'repair', actor: NAME }, 'actor');
    new BeliefTable(NAME).set('SomeoneElse', +0.4, 'noted');
    const m = ruminate(NAME, { persist: false });
    assert.match(m, /quietly proud of/);
});

test('DMN: dissonance takes precedence over pride when BOTH fire', () => {
    // Festinger's asymmetry: wrong-action looms larger than right-action.
    const log = new AffectLog(NAME);
    log.record({ type: 'repair', actor: NAME }, 'actor');
    log.record({ type: 'repair', actor: NAME }, 'actor');
    log.record({ type: 'attack_player', actor: NAME, target: 'X' }, 'actor');
    log.record({ type: 'attack_player', actor: NAME, target: 'Y' }, 'actor');
    new BeliefTable(NAME).set('SomeoneElse', +0.4, 'noted');

    const m = ruminate(NAME, { persist: false });
    assert.match(m, /cannot reconcile/);
    assert.ok(!/quietly proud/.test(m), `dissonance should preempt pride: ${m}`);
});

test('DMN: silent on no actor entries', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: 'Other', target: NAME }, 'target');
    new BeliefTable(NAME).set('Other', -0.5, 'attacked me');

    const m = ruminate(NAME, { persist: false });
    assert.ok(!/quietly proud|cannot reconcile|sits well|sits in me wrong/.test(m),
        `no actor entries → no self-confrontation line: ${m}`);
});
