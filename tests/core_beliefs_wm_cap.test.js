/**
 * Tests for v0.67 — Miller's 7±2 working-memory cap on BeliefTable prompts.
 *
 * Confirms:
 *   - small belief sets render unchanged (no false truncation)
 *   - exactly-cap belief sets render unchanged
 *   - over-cap belief sets render top-N + a "backgrounded" footer
 *   - active belief order is by |trust| desc (loudest signals first)
 *   - footer names the weakest relationships
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { BeliefTable } from '../core/beliefs/belief_table.js';

const NAME = '_TestWMCap';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

test('small belief set renders unchanged (no false truncation)', () => {
    const t = new BeliefTable(NAME);
    t.set('A', +0.5, 'r1');
    t.set('B', -0.3, 'r2');
    const text = t.asPromptText();
    assert.match(text, /A:/);
    assert.match(text, /B:/);
    assert.ok(!/in your awareness/.test(text), 'no backgrounding marker for small sets');
});

test('exactly-cap belief set has no backgrounding marker', () => {
    const t = new BeliefTable(NAME);
    for (let i = 0; i < 9; i++) {
        t.set(`Friend${i}`, 0.1 + i * 0.05, `note ${i}`);
    }
    const text = t.asPromptText();
    assert.ok(!/in your awareness/.test(text), 'cap-size set should not background');
});

test('over-cap belief set: top-by-charge are visible, weakest are backgrounded', () => {
    const t = new BeliefTable(NAME);
    // 12 targets at varying trust intensities — strongest at the extremes.
    t.set('LoudPos1', +0.95, 'huge ally');
    t.set('LoudPos2', +0.85, 'strong ally');
    t.set('LoudPos3', +0.70, 'good friend');
    t.set('LoudNeg1', -0.95, 'sworn enemy');
    t.set('LoudNeg2', -0.85, 'rival');
    t.set('LoudNeg3', -0.70, 'distrusted');
    t.set('Mid1', +0.55, 'reliable');
    t.set('Mid2', -0.50, 'wary');
    t.set('Mid3', +0.45, 'cordial');
    // Below the cap of 9 — should be backgrounded
    t.set('Quiet1', +0.10, 'barely noticed');
    t.set('Quiet2', -0.08, 'almost neutral');
    t.set('Quiet3', +0.05, 'background');

    const text = t.asPromptText();
    // The three loudest in each direction must appear as full lines
    assert.match(text, /LoudPos1.*\+0\.95/);
    assert.match(text, /LoudNeg1.*-0\.95/);
    // The quiet ones must NOT appear as full lines
    assert.ok(!/Quiet1.*0\.10/.test(text),
        `Quiet1 should not be a full line: ${text}`);
    // But they SHOULD appear in the backgrounding marker
    assert.match(text, /in your awareness.*Quiet1/);
    assert.match(text, /in your awareness.*Quiet2/);
    assert.match(text, /in your awareness.*Quiet3/);
});

test('active beliefs are ranked by absolute charge, not signed trust', () => {
    const t = new BeliefTable(NAME);
    // Mix of strong negatives and weak positives — strong negatives must
    // out-rank weak positives.
    for (let i = 0; i < 12; i++) {
        t.set(`Pos${i}`, 0.05 + i * 0.01, `weak +`);
    }
    t.set('StrongEnemy', -0.9, 'sworn');
    const text = t.asPromptText();
    // StrongEnemy at -0.9 must be in the top 9 (active), not backgrounded
    assert.match(text, /StrongEnemy: ENEMY/);
});
