/**
 * Tests for v0.73 — stress-induced narrowing of working memory.
 *
 * Real cognitive psych: Easterbrook 1959 ("the effect of emotion on cue
 * utilization") and Kahneman 1973 (Attention and Effort) — under high
 * arousal, attentional capacity contracts. People narrow onto threat-
 * relevant cues and lose peripherals.
 *
 * Composes v0.56 (allostatic load) with v0.67 (working-memory cap):
 *   baseline   load        → 9 active beliefs
 *   elevated  ≥0.35        → 7 active
 *   allostatic ≥0.55       → 5 active
 *   overloaded ≥0.7        → 3 active
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { recordStress } from '../core/cognition/allostatic_load.js';

const NAME = '_TestNarrow';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

function seed12Beliefs(t) {
    t.set('Target01', +0.95, 'r');
    t.set('Target02', -0.95, 'r');
    t.set('Target03', +0.85, 'r');
    t.set('Target04', -0.85, 'r');
    t.set('Target05', +0.75, 'r');
    t.set('Target06', -0.75, 'r');
    t.set('Target07', +0.65, 'r');
    t.set('Target08', -0.65, 'r');
    t.set('Target09', +0.55, 'r');
    t.set('Target10', -0.45, 'r');
    t.set('Target11', +0.35, 'r');
    t.set('Target12', -0.25, 'r');
}

function countActiveLines(text) {
    // Active belief lines start with "- " in the format we emit.
    return text.split('\n').filter(l => l.match(/^- Target/)).length;
}

test('baseline load: 9 active beliefs visible (Miller cap unchanged)', () => {
    const t = new BeliefTable(NAME);
    seed12Beliefs(t);
    // No stress recorded — load is 0, level baseline.
    const text = t.asPromptText();
    assert.equal(countActiveLines(text), 9);
});

test('elevated load: cap shrinks to 7', () => {
    const t = new BeliefTable(NAME);
    seed12Beliefs(t);
    // Drive load just past 0.35: arousal=1.0 × LOAD_RATE 0.07 → ~5 calls.
    for (let i = 0; i < 6; i++) recordStress(NAME, 1.0);
    const text = t.asPromptText();
    assert.equal(countActiveLines(text), 7);
});

test('allostatic load: cap shrinks to 5 + narrowing note appears', () => {
    const t = new BeliefTable(NAME);
    seed12Beliefs(t);
    // Drive load past 0.55: ~9 calls.
    for (let i = 0; i < 9; i++) recordStress(NAME, 1.0);
    const text = t.asPromptText();
    assert.equal(countActiveLines(text), 5);
    assert.match(text, /allostatic load.*attention has narrowed/);
});

test('overloaded load: only 3 loudest signals visible', () => {
    const t = new BeliefTable(NAME);
    seed12Beliefs(t);
    // Drive load past 0.7
    for (let i = 0; i < 25; i++) recordStress(NAME, 1.0);
    const text = t.asPromptText();
    assert.equal(countActiveLines(text), 3);
    assert.match(text, /overloaded load/);
    // The three loudest by |trust| should be Target01, Target02, Target03
    assert.match(text, /Target01/);
    assert.match(text, /Target02/);
    assert.match(text, /Target03/);
    assert.ok(!/^- Target04/m.test(text), 'Target04 should NOT be in active set');
});

test('overloaded: backgrounded footer lists the dropped names', () => {
    const t = new BeliefTable(NAME);
    seed12Beliefs(t);
    for (let i = 0; i < 25; i++) recordStress(NAME, 1.0);
    const text = t.asPromptText();
    assert.match(text, /in your awareness.*Target04/);
});
