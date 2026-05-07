/**
 * Tests for core/affect/somatic.js — Damasio-style somatic markers.
 *
 * Confirms:
 *   - no DNA → multiplier 1.0
 *   - aligned DNA → multiplier 1.0 (no boost on confirmation)
 *   - opposing DNA → multiplier > 1.0 (boost on misalignment)
 *   - unknown event type → multiplier 1.0
 *   - explainSomatic returns named axis when boost fires
 *   - integration: pacifist witness reacts harder to violence than warrior witness
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { somaticAmplify, explainSomatic } from '../core/affect/somatic.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { _resetFactionCache } from '../core/identity/faction.js';

const NAMES = ['_TestSomA', '_TestSomB', '_TestSomC'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

/**
 * Synthesize a soul.md whose keyword profile pushes DNA toward a chosen pole.
 * Pacifist: heavy mercy + contemplation, light action.
 * Warrior:  heavy justice (anti-mercy) + action.
 */
function pacifistSoul(name) {
    const dir = join('./bots', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'),
        `# ${name}\n\n` +
        '- I have learned mercy mercy mercy. I forgive, I spare, I show compassion.\n' +
        '- I value patience. I wait. I watch. I reflect. I am still. I sit.\n' +
        '- I will never strike, I will never attack. Compassion. Pity. Grace.\n');
}

function warriorSoul(name) {
    const dir = join('./bots', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'),
        `# ${name}\n\n` +
        '- I have learned justice. The rule is the rule. Punish. Enforce. Condemn.\n' +
        '- I act. I fight. I strike. I move. I attack. I engage. I take risk.\n');
}

// ────────────────────────────────────────────────────────────────────
// Pure-math tests
// ────────────────────────────────────────────────────────────────────

test('no DNA → multiplier is 1.0', () => {
    assert.equal(somaticAmplify('_TestSomA', 'attack_player'), 1.0);
});

test('unknown event type → multiplier is 1.0 even with DNA', () => {
    pacifistSoul('_TestSomA');
    assert.equal(somaticAmplify('_TestSomA', 'unmapped_event'), 1.0);
});

test('aligned DNA → no boost (warrior witnessing violence)', () => {
    warriorSoul('_TestSomA');
    // attack_player collides with mercy(-1) + action(+1).
    // Warrior: mercy <= 0, action >= +1 → BOTH align with event poles → no opposition.
    const m = somaticAmplify('_TestSomA', 'attack_player');
    assert.equal(m, 1.0, `expected no boost on alignment, got ${m}`);
});

test('opposing DNA → boost (pacifist witnessing violence)', () => {
    pacifistSoul('_TestSomA');
    // Pacifist: mercy ≈ +1, action ≈ -1 (or low).
    // attack_player collides mercy(-1) + action(+1).
    //   mercy: dna=+1, sign=-1 → opposing, contributes 1
    //   action: dna<0, sign=+1 → opposing, contributes |action|
    // → boost should fire.
    const m = somaticAmplify('_TestSomA', 'attack_player');
    assert.ok(m > 1.05, `expected boost from value collision, got ${m}`);
});

test('explainSomatic names the colliding axis when boost fires', () => {
    pacifistSoul('_TestSomA');
    const r = explainSomatic('_TestSomA', 'attack_player');
    assert.ok(r.multiplier > 1.05);
    assert.match(r.reason, /collides.*(mercy|action)/);
});

test('explainSomatic notes alignment when no boost fires', () => {
    warriorSoul('_TestSomA');
    const r = explainSomatic('_TestSomA', 'attack_player');
    assert.match(r.reason, /aligns/);
});

// ────────────────────────────────────────────────────────────────────
// Integration with auto_update.js
// ────────────────────────────────────────────────────────────────────

test('integration: pacifist trust drops harder than warrior on identical attack', () => {
    pacifistSoul('_TestSomA');
    warriorSoul('_TestSomB');
    const actor = '_TestSomC';
    const target = 'irrelevant';

    // Witness lists deliberately each contain ONLY one of the two so they
    // don't influence each other's faction or empathy paths. Both also
    // start with no prior trust in actor, so surprise factor is also 1.0.
    applyEventToBeliefs({ type: 'attack_player', actor, target }, ['_TestSomA']);
    applyEventToBeliefs({ type: 'attack_player', actor, target }, ['_TestSomB']);

    const pacifistTrust = new BeliefTable('_TestSomA').get(actor).trust;
    const warriorTrust  = new BeliefTable('_TestSomB').get(actor).trust;

    // Both negative; pacifist's drop should exceed warrior's.
    assert.ok(pacifistTrust < warriorTrust - 0.01,
        `expected pacifist's drop to exceed warrior's: pacifist=${pacifistTrust}, warrior=${warriorTrust}`);
});

test('integration: warrior trust unchanged-relative to baseline on identical attack', () => {
    warriorSoul('_TestSomA');
    // _TestSomB has NO soul → no DNA → no somatic effect. Acts as baseline.
    const actor = '_TestSomC';
    const target = 'irrelevant';

    applyEventToBeliefs({ type: 'attack_player', actor, target }, ['_TestSomA']);
    applyEventToBeliefs({ type: 'attack_player', actor, target }, ['_TestSomB']);

    const warriorTrust  = new BeliefTable('_TestSomA').get(actor).trust;
    const baselineTrust = new BeliefTable('_TestSomB').get(actor).trust;

    // Aligned warrior should match baseline (no DNA) — no boost, no penalty.
    assert.ok(Math.abs(warriorTrust - baselineTrust) < 0.001,
        `aligned warrior should equal no-DNA baseline: ${warriorTrust} vs ${baselineTrust}`);
});
