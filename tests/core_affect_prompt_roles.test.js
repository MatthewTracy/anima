/**
 * Tests for v0.59 — role-aware $MOOD prompt formatting.
 *
 * AffectLog.asPromptText must distinguish between:
 *   - role='target'    → "(to me)"
 *   - role='actor'     → "(my hand)"
 *   - role='vicarious' (negative valence) → "(felt with)"
 *   - role='vicarious' (positive valence) → "(felt against)"  Schadenfreude
 *   - role='witness'   → no prefix (default bystander)
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { _resetFactionCache } from '../core/identity/faction.js';

const NAMES = ['_TestRoleA', '_TestRoleB', '_TestRoleC'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

test('target entry gets "(to me)" prefix', () => {
    const me = '_TestRoleA';
    const log = new AffectLog(me);
    log.record({ type: 'attack_player', actor: 'X', target: me }, 'target');
    const text = log.asPromptText();
    assert.match(text, /\(to me\) attack_player/);
});

test('vicarious negative-valence entry gets "(felt with)" prefix', () => {
    const lover  = '_TestRoleA';
    const actor  = '_TestRoleB';
    const target = '_TestRoleC';
    new BeliefTable(lover).set(target, +0.85, 'beloved');
    applyEventToBeliefs({ type: 'attack_player', actor, target }, [lover, actor, target]);
    const text = new AffectLog(lover).asPromptText();
    assert.match(text, /\(felt with\) attack_player/, `got: ${text}`);
});

test('vicarious positive-valence entry gets "(felt against)" prefix (Schadenfreude)', () => {
    const enemyOfTarget = '_TestRoleA';
    const actor         = '_TestRoleB';
    const target        = '_TestRoleC';
    new BeliefTable(enemyOfTarget).set(target, -0.85, 'sworn enemy');
    applyEventToBeliefs({ type: 'attack_player', actor, target }, [enemyOfTarget, actor, target]);
    const text = new AffectLog(enemyOfTarget).asPromptText();
    assert.match(text, /\(felt against\) attack_player/, `got: ${text}`);
});

test('actor self-entry gets "(my hand)" prefix', () => {
    const me = '_TestRoleA';
    const log = new AffectLog(me);
    log.record({ type: 'attack_player', actor: me, target: 'X' }, 'actor');
    const text = log.asPromptText();
    assert.match(text, /\(my hand\) attack_player/);
});

test('plain witness entry has no role prefix', () => {
    const me = '_TestRoleA';
    const log = new AffectLog(me);
    log.record({ type: 'attack_player', actor: 'X', target: 'Y' }, 'witness');
    const text = log.asPromptText();
    // No prefix should appear — no parentheses immediately before attack_player
    assert.match(text, /\] attack_player/);
    assert.ok(!/\(to me\)|\(my hand\)|\(felt with\)|\(felt against\)/.test(text),
        `bystander witness should have no role prefix: ${text}`);
});
