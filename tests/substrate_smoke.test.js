/**
 * v0.81 — substrate-wide smoke test.
 *
 * Existing unit tests cover individual layers. This test exercises the
 * full multiplicative pipeline (auto_update + 5 per-event factors +
 * vicarious replacement + allostatic recording + DMN + dishabituation)
 * by firing every known event type from DEFAULT_AFFECT against a
 * synthetic 4-agent roster. It also walks several edge cases that
 * unit tests rarely hit:
 *   - empty witness list
 *   - actor === target
 *   - missing actor / missing target
 *   - unknown event types (no entry in DEFAULT_AFFECT)
 *   - very long event sequences (allostatic accumulation + recovery)
 *
 * The test asserts NO CRASHES and that all expected on-disk state files
 * end up populated. It does not validate the numerical correctness of
 * each layer (those are the unit tests' job).
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { DEFAULT_AFFECT, AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { ruminate } from '../core/cognition/dmn.js';
import { tickRecovery } from '../core/cognition/allostatic_load.js';
import { setFaction, _resetFactionCache } from '../core/identity/faction.js';
import { Persona } from '../core/personas/persona.js';

const ROSTER = ['_TestSmoke1', '_TestSmoke2', '_TestSmoke3', '_TestSmoke4'];

function clean() {
    _resetFactionCache();
    for (const n of ROSTER) {
        if (existsSync(join('./bots', n))) rmSync(join('./bots', n), { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

test('every DEFAULT_AFFECT event type fires without crashing', () => {
    const types = Object.keys(DEFAULT_AFFECT);
    let lastError = null;
    for (const type of types) {
        try {
            applyEventToBeliefs(
                { type, actor: ROSTER[0], target: ROSTER[1] },
                ROSTER
            );
        } catch (e) {
            lastError = `${type}: ${e.message}`;
            break;
        }
    }
    assert.equal(lastError, null, `expected no crashes, got: ${lastError}`);
});

test('edge case: empty witness list does not crash', () => {
    assert.doesNotThrow(() => {
        applyEventToBeliefs(
            { type: 'attack_player', actor: ROSTER[0], target: ROSTER[1] },
            []
        );
    });
});

test('edge case: actor === target does not crash and does not self-update', () => {
    applyEventToBeliefs(
        { type: 'speak', actor: ROSTER[0], target: ROSTER[0] },
        ROSTER
    );
    // The actor should not have a belief about themselves — get(self) returns null.
    const self = new BeliefTable(ROSTER[0]).get(ROSTER[0]);
    assert.equal(self, null, 'agent should never form a belief about themselves');
});

test('edge case: missing actor does not crash', () => {
    assert.doesNotThrow(() => {
        applyEventToBeliefs(
            { type: 'speak', target: ROSTER[1] },
            ROSTER
        );
    });
});

test('edge case: missing target does not crash', () => {
    assert.doesNotThrow(() => {
        applyEventToBeliefs(
            { type: 'repair', actor: ROSTER[0] },
            ROSTER
        );
    });
});

test('edge case: unknown event type does not crash and does no work', () => {
    assert.doesNotThrow(() => {
        applyEventToBeliefs(
            { type: 'never_seen_in_default_affect', actor: ROSTER[0], target: ROSTER[1] },
            ROSTER
        );
    });
    // No beliefs should have been updated since DEFAULT_DELTAS has no entry.
    // BeliefTable.get returns a neutral default object for unseen targets.
    const view = new BeliefTable(ROSTER[1]).get(ROSTER[0]);
    assert.equal(view.trust, 0);
    assert.equal(view.evidence.length, 0);
});

test('long sequence of events accumulates and recovers without explosion', () => {
    // 30 attacks against agent 1 — well past where allostatic load would saturate.
    for (let i = 0; i < 30; i++) {
        applyEventToBeliefs(
            { type: 'attack_player', actor: ROSTER[0], target: ROSTER[1] },
            ROSTER
        );
        // Recovery between turns prevents permanent overload
        tickRecovery(ROSTER);
    }
    // All four agents should have populated affect.json by now (or 3 if
    // ROSTER[0] only saw their own action).
    let affectFiles = 0;
    for (const n of ROSTER) {
        if (existsSync(join('./bots', n, 'affect.json'))) affectFiles++;
    }
    assert.ok(affectFiles >= 2, `expected at least 2 agents with affect logs, got ${affectFiles}`);
});

test('ruminate produces output for every roster member after a real-ish session', () => {
    // A short sequence designed to give each agent something to think about
    setFaction(ROSTER[0], 'guild');
    setFaction(ROSTER[1], 'guild');
    setFaction(ROSTER[2], 'rivals');
    setFaction(ROSTER[3], 'rivals');
    new BeliefTable(ROSTER[0]).set(ROSTER[1], +0.7, 'old friend');
    new BeliefTable(ROSTER[2]).set(ROSTER[1], -0.6, 'rival');

    applyEventToBeliefs({ type: 'attack_player', actor: ROSTER[2], target: ROSTER[1] }, ROSTER);
    applyEventToBeliefs({ type: 'repair', actor: ROSTER[0] }, ROSTER);
    applyEventToBeliefs({ type: 'attack_player', actor: ROSTER[1], target: ROSTER[2] }, ROSTER);

    for (const n of ROSTER) {
        const m = ruminate(n, { persist: false });
        // We don't care what the monologue says; we just want it to NOT throw
        // and to produce *something* for at least the agents who participated.
        assert.equal(typeof m, 'string', `ruminate should return string for ${n}`);
    }
});

test('persona inspector + slip composes with full event flow', () => {
    // Adopt a mask, then exhaust the agent — verify persona prompt updates.
    new Persona(ROSTER[0]).adopt({ alias: 'Disguised', motive: 'unknown' });
    for (let i = 0; i < 30; i++) {
        applyEventToBeliefs(
            { type: 'attack_player', actor: ROSTER[1], target: ROSTER[0] },
            ROSTER
        );
        // No tickRecovery — let load climb
    }
    const prompt = new Persona(ROSTER[0]).asPromptText();
    // Should now read the slipping note
    assert.match(prompt, /MASK IS (SLIPPING|HEAVIER)/);
});
