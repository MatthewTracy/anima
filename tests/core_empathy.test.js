/**
 * Tests for vicarious affect / empathy — mirror-neuron-style emotional
 * contagion through trust ties (Preston & de Waal 2002; Decety & Ickes 2009).
 *
 * Confirms:
 *   - witness with HIGH trust in target gets vicarious affect when target hurt
 *   - witness with LOW trust in target gets nothing
 *   - witness who DISTRUSTS target gets vicarious *positive* affect when
 *     target hurt (Schadenfreude — sign flip via signed scale)
 *   - vicarious magnitude is smaller than direct
 *   - vicarious entry is tagged role='vicarious'
 *   - mood actually shifts in expected direction across multiple events
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { _resetFactionCache } from '../core/identity/faction.js';

const NAMES = ['_TestEmpA', '_TestEmpB', '_TestEmpC', '_TestEmpD'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('witness who loves target feels vicarious pain when target is harmed', () => {
    const lover   = '_TestEmpA';
    const actor   = '_TestEmpB';
    const target  = '_TestEmpC';

    new BeliefTable(lover).set(target, +0.8, 'beloved companion');

    applyEventToBeliefs(
        { type: 'attack_player', actor, target },
        [lover, actor, target]
    );

    const log = new AffectLog(lover);
    const data = log._load();
    const vicarious = data.log.filter(e => e.role === 'vicarious');
    assert.ok(vicarious.length >= 1, `expected vicarious entry, got log: ${JSON.stringify(data.log)}`);
    const v = vicarious[0];
    assert.ok(v.valence < 0, `expected negative vicarious valence, got ${v.valence}`);
});

test('witness with neutral trust in target gets no vicarious entry', () => {
    const stranger = '_TestEmpA';
    const actor    = '_TestEmpB';
    const target   = '_TestEmpC';
    // no trust set on target — defaults to 0

    applyEventToBeliefs(
        { type: 'attack_player', actor, target },
        [stranger, actor, target]
    );

    const data = new AffectLog(stranger)._load();
    const vicarious = data.log.filter(e => e.role === 'vicarious');
    assert.equal(vicarious.length, 0, 'a stranger should not feel vicarious pain');
});

test('witness who hates target gets POSITIVE vicarious affect (Schadenfreude)', () => {
    const enemy  = '_TestEmpA';
    const actor  = '_TestEmpB';
    const target = '_TestEmpC';

    new BeliefTable(enemy).set(target, -0.8, 'sworn enemy');

    applyEventToBeliefs(
        { type: 'attack_player', actor, target },
        [enemy, actor, target]
    );

    const data = new AffectLog(enemy)._load();
    const vicarious = data.log.filter(e => e.role === 'vicarious');
    assert.ok(vicarious.length >= 1, 'enemy of target should still register a vicarious entry');
    // negative target valence × negative trust → positive vicarious valence
    assert.ok(vicarious[0].valence > 0,
        `expected Schadenfreude (positive valence), got ${vicarious[0].valence}`);
});

test('vicarious magnitude is strictly smaller than direct (target) magnitude', () => {
    const lover  = '_TestEmpA';
    const actor  = '_TestEmpB';
    const target = '_TestEmpC';

    new BeliefTable(lover).set(target, +0.9, 'devoted');
    applyEventToBeliefs(
        { type: 'attack_player', actor, target },
        [lover, actor, target]
    );

    const loverEntry  = new AffectLog(lover)._load().log.find(e => e.role === 'vicarious');
    const targetEntry = new AffectLog(target)._load().log.find(e => e.role === 'target');
    assert.ok(loverEntry, 'lover should have a vicarious entry');
    assert.ok(targetEntry, 'target should have a target entry');
    assert.ok(loverEntry.magnitude < targetEntry.magnitude,
        `vicarious magnitude ${loverEntry.magnitude} should be < direct ${targetEntry.magnitude}`);
});

test('actor-side empathy: witness who admires actor feels actor-side affect (no target)', () => {
    // Use an event with no target — e.g. 'repair' (positive, byActor only).
    const fan = '_TestEmpA';
    const hero = '_TestEmpB';

    new BeliefTable(fan).set(hero, +0.9, 'admired');
    applyEventToBeliefs(
        { type: 'repair', actor: hero },
        [fan, hero]
    );

    const data = new AffectLog(fan)._load();
    const vicarious = data.log.filter(e => e.role === 'vicarious');
    assert.ok(vicarious.length >= 1, 'fan should feel vicariously when hero does good');
    assert.ok(vicarious[0].valence > 0, `expected positive vicarious valence, got ${vicarious[0].valence}`);
});

test('mood drift: repeated harm to a loved one shifts witness mood negative', () => {
    const lover  = '_TestEmpA';
    const actor  = '_TestEmpB';
    const target = '_TestEmpC';

    new BeliefTable(lover).set(target, +0.85, 'beloved');

    for (let i = 0; i < 5; i++) {
        applyEventToBeliefs(
            { type: 'attack_player', actor, target },
            [lover, actor, target]
        );
    }
    const mood = new AffectLog(lover).currentMood();
    assert.ok(mood.valence < -0.05,
        `expected negative mood drift from vicarious harm, got ${mood.valence}`);
});

test('vicarious entries are excluded from the "no role" baseline (always tagged)', () => {
    const lover = '_TestEmpA';
    new BeliefTable(lover).set('_TestEmpC', +0.7, 'beloved');
    applyEventToBeliefs(
        { type: 'attack_player', actor: '_TestEmpB', target: '_TestEmpC' },
        [lover, '_TestEmpB', '_TestEmpC']
    );
    const data = new AffectLog(lover)._load();
    for (const e of data.log) {
        assert.ok(['actor', 'target', 'witness', 'vicarious'].includes(e.role),
            `unexpected role: ${e.role}`);
    }
});
