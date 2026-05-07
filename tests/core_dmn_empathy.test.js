/**
 * Tests for v0.54 — DMN narrative integration of empathy.
 *
 * The DMN's _replayLine should distinguish:
 *   - role='target'    → "X did Y to me, and the memory still cuts"
 *   - role='actor'     → "what I myself did — Y — and how that ..."
 *   - role='vicarious' → "what <target> had to live through when X did Y"
 *                         (or Schadenfreude phrasing if vicarious valence > 0)
 *   - role='witness'   → default "X did Y, and the memory ..."
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { ruminate } from '../core/cognition/dmn.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { _resetFactionCache } from '../core/identity/faction.js';

const NAMES = ['_TestDMNEmpA', '_TestDMNEmpB', '_TestDMNEmpC'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

test('vicarious harm to a loved one surfaces with empathy phrasing', () => {
    const lover  = '_TestDMNEmpA';
    const actor  = '_TestDMNEmpB';
    const target = '_TestDMNEmpC';

    new BeliefTable(lover).set(target, +0.85, 'beloved');
    new BeliefTable(lover).set(actor, -0.4, 'wary');

    // Multiple harms to drive mood and ensure vicarious entry dominates.
    for (let i = 0; i < 3; i++) {
        applyEventToBeliefs({ type: 'attack_player', actor, target }, [lover, actor, target]);
    }

    const m = ruminate(lover, { persist: false });
    assert.match(m, new RegExp(`${target} had to live through`),
        `expected vicarious harm phrasing, got: ${m}`);
});

test('Schadenfreude (vicarious positive valence) reads as relief, not pain', () => {
    const enemyOfTarget = '_TestDMNEmpA';
    const actor         = '_TestDMNEmpB';
    const target        = '_TestDMNEmpC';

    // I distrust target; when they're harmed, my vicarious valence is +.
    new BeliefTable(enemyOfTarget).set(target, -0.9, 'sworn enemy');

    // Also tip mood positive so congruentMoments preserves the entry.
    for (let i = 0; i < 5; i++) {
        applyEventToBeliefs({ type: 'attack_player', actor, target }, [enemyOfTarget, actor, target]);
    }

    const m = ruminate(enemyOfTarget, { persist: false });
    // Either the "strange small relief" path (full sentence) or the second-
    // moment path ("quieter justice") must appear — both indicate the
    // role-aware empathy phrasing is engaged.
    assert.ok(/strange small relief|quieter justice/.test(m),
        `expected Schadenfreude empathy phrasing, got: ${m}`);
});

test('direct target experience uses normal "the memory still cuts" phrasing', () => {
    const me     = '_TestDMNEmpA';
    const actor  = '_TestDMNEmpB';

    new BeliefTable(me).set(actor, -0.6, 'attacked me');

    for (let i = 0; i < 3; i++) {
        applyEventToBeliefs({ type: 'attack_player', actor, target: me }, [me, actor]);
    }

    const m = ruminate(me, { persist: false });
    // No vicarious phrasing should appear — I AM the target, not a witness
    // to a beloved's harm.
    assert.ok(!/had to live through|strange small relief/.test(m),
        `expected target phrasing without empathy markers, got: ${m}`);
    assert.match(m, /still cuts|still warms/);
});
