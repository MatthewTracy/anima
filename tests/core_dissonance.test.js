/**
 * Tests for v0.74 — cognitive dissonance line in DMN.
 *
 * Real cognitive psych: Festinger (1957) "A Theory of Cognitive
 * Dissonance". When you act in ways that contradict your values, you
 * experience mental discomfort that surfaces in self-narrative. We
 * detect this as a fingerprint in the AffectLog: role='actor' entries
 * with negative valence — actions YOU took that felt bad to take.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { ruminate } from '../core/cognition/dmn.js';

const NAME = '_TestDissonance';
const TARGET_NAMES = ['_TestDisX'];

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
    for (const n of TARGET_NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

test('two negative-valence self-actions trigger the loud dissonance line', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: NAME, target: '_TestDisX' }, 'actor');
    log.record({ type: 'attack_player', actor: NAME, target: 'Y' }, 'actor');
    new BeliefTable(NAME).set('X', -0.3, 'context');

    const m = ruminate(NAME, { persist: false });
    assert.match(m, /cannot reconcile with who I thought I was/);
});

test('single strong negative self-action triggers the soft variant', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: NAME, target: '_TestDisX' }, 'actor');
    new BeliefTable(NAME).set('X', -0.5, 'reason');

    const m = ruminate(NAME, { persist: false });
    assert.match(m, /sits in me wrong/);
});

test('positive-valence self-actions do NOT trigger dissonance', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'repair', actor: NAME }, 'actor');
    log.record({ type: 'repair', actor: NAME }, 'actor');
    new BeliefTable(NAME).set('SomeoneElse', +0.5, 'noted');

    const m = ruminate(NAME, { persist: false });
    assert.ok(!/cannot reconcile|sits in me wrong/.test(m),
        `acting in line with values should not trigger dissonance: ${m}`);
});

test('victim entries (role=target) do not trigger dissonance', () => {
    // Being attacked is not a moral self-conflict — only one's OWN
    // actions trigger Festinger-style dissonance.
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: 'Other', target: NAME }, 'target');
    log.record({ type: 'attack_player', actor: 'Other', target: NAME }, 'target');
    new BeliefTable(NAME).set('Other', -0.7, 'attacker');

    const m = ruminate(NAME, { persist: false });
    assert.ok(!/cannot reconcile|sits in me wrong/.test(m),
        `victim role should not trigger dissonance: ${m}`);
});

test('one mild negative self-action does NOT trigger (insufficient evidence)', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: NAME, target: '_TestDisX' }, 'actor');
    new BeliefTable(NAME).set('X', -0.2, 'context');

    const m = ruminate(NAME, { persist: false });
    // flog has valence -0.5 arousal 0.6 → magnitude ~0.30 — below the soft
    // threshold of 0.4, so neither variant should fire.
    assert.ok(!/cannot reconcile|sits in me wrong/.test(m),
        `mild single dissonance should stay silent: ${m}`);
});
