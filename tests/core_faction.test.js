/**
 * Tests for core/identity/faction.js — Tajfel-style in-group bias.
 *
 * Confirms:
 *   - faction.txt round-trips
 *   - getFaction falls back to soul.md when no faction.txt
 *   - sharesFaction discriminates correctly, including 'unknown' refusal
 *   - ingroupBias returns the four expected modulations
 *   - integration with auto_update: same-faction trust gain > cross-faction;
 *     same-faction trust loss < cross-faction.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
    getFaction, setFaction, sharesFaction, ingroupBias, explainIngroup, _resetFactionCache
} from '../core/identity/faction.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';

const NAMES = ['_TestFacA', '_TestFacB', '_TestFacC', '_TestFacD', '_TestFacE'];

function clean() {
    _resetFactionCache();
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

// ────────────────────────────────────────────────────────────────────
// Faction file plumbing
// ────────────────────────────────────────────────────────────────────

test('setFaction + getFaction round-trip', () => {
    setFaction('_TestFacA', 'Crew');
    assert.equal(getFaction('_TestFacA'), 'crew');
});

test('getFaction returns "unknown" for an agent with no records', () => {
    assert.equal(getFaction('_TestFacB'), 'unknown');
});

test('getFaction falls back to soul.md "of the X kind" pattern', () => {
    const dir = join('./bots', '_TestFacC');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'),
        '# _TestFacC\n\n- I was born into this world on 2026-05-06, of the Cloister kind.\n');
    _resetFactionCache();
    assert.equal(getFaction('_TestFacC'), 'cloister');
});

test('faction.txt overrides soul.md when both exist (mutiny scenario)', () => {
    const dir = join('./bots', '_TestFacD');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'),
        '# _TestFacD\n\n- I was born into this world on 2026-05-06, of the loyalists kind.\n');
    setFaction('_TestFacD', 'mutineers');
    assert.equal(getFaction('_TestFacD'), 'mutineers');
});

// ────────────────────────────────────────────────────────────────────
// sharesFaction logic
// ────────────────────────────────────────────────────────────────────

test('sharesFaction is true only when both factions are known and equal', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'crew');
    setFaction('_TestFacC', 'navy');
    assert.equal(sharesFaction('_TestFacA', '_TestFacB'), true);
    assert.equal(sharesFaction('_TestFacA', '_TestFacC'), false);
    // Unknown side ⇒ false
    assert.equal(sharesFaction('_TestFacA', '_TestFacD'), false);
    // Self ⇒ false
    assert.equal(sharesFaction('_TestFacA', '_TestFacA'), false);
});

// ────────────────────────────────────────────────────────────────────
// ingroupBias modulations
// ────────────────────────────────────────────────────────────────────

test('ingroupBias: same-faction + positive delta amplifies', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'crew');
    const m = ingroupBias('_TestFacA', '_TestFacB', +0.1);
    assert.ok(m > 1.0, `expected amplification, got ${m}`);
});

test('ingroupBias: same-faction + negative delta dampens', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'crew');
    const m = ingroupBias('_TestFacA', '_TestFacB', -0.1);
    assert.ok(m < 1.0, `expected dampening, got ${m}`);
});

test('ingroupBias: cross-faction + negative delta amplifies (suspicion)', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'navy');
    const m = ingroupBias('_TestFacA', '_TestFacB', -0.1);
    assert.ok(m > 1.0, `expected amplification, got ${m}`);
});

test('ingroupBias: cross-faction + positive delta dampens (downplay)', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'navy');
    const m = ingroupBias('_TestFacA', '_TestFacB', +0.1);
    assert.ok(m < 1.0, `expected dampening, got ${m}`);
});

test('ingroupBias: unknown side collapses to 1.0', () => {
    setFaction('_TestFacA', 'crew');
    // _TestFacB has no faction
    const m = ingroupBias('_TestFacA', '_TestFacB', -0.1);
    assert.equal(m, 1.0);
});

test('ingroupBias: zero delta → 1.0 regardless', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'navy');
    assert.equal(ingroupBias('_TestFacA', '_TestFacB', 0), 1.0);
});

test('explainIngroup names the mechanism', () => {
    setFaction('_TestFacA', 'crew');
    setFaction('_TestFacB', 'crew');
    const r = explainIngroup('_TestFacA', '_TestFacB', +0.1);
    assert.match(r.reason, /in-group.*praising/);
});

// ────────────────────────────────────────────────────────────────────
// Integration: in-group bias actually modulates BeliefTable updates
// ────────────────────────────────────────────────────────────────────

test('integration: same-faction good deed reads stronger than cross-faction good deed', () => {
    // Two witnesses, same prior trust (0). Actor does something good.
    // Witness A is same-faction as actor; B is cross-faction.
    // A's positive delta should exceed B's.
    const witnessA = '_TestFacA';
    const witnessB = '_TestFacB';
    const actor    = '_TestFacC';
    const target   = '_TestFacD';
    setFaction(witnessA, 'crew');
    setFaction(actor, 'crew');
    setFaction(witnessB, 'navy');

    const event = { type: 'repair', actor };
    applyEventToBeliefs(event, [witnessA, witnessB, target]);

    const aTrust = new BeliefTable(witnessA).get(actor).trust;
    const bTrust = new BeliefTable(witnessB).get(actor).trust;

    assert.ok(aTrust > bTrust + 0.005,
        `expected in-group bonus: aTrust=${aTrust}, bTrust=${bTrust}`);
});

test('integration: same-faction misstep cushioned vs cross-faction misstep amplified', () => {
    // Mirror image — hostile act. Same-faction witness is more forgiving.
    const witnessA = '_TestFacA';
    const witnessB = '_TestFacB';
    const actor    = '_TestFacC';
    const target   = '_TestFacE';
    setFaction(witnessA, 'crew');
    setFaction(actor, 'crew');
    setFaction(witnessB, 'navy');
    // target has no faction so it doesn't double-count

    const event = { type: 'attack_player', actor, target };
    applyEventToBeliefs(event, [witnessA, witnessB, target]);

    const aTrust = new BeliefTable(witnessA).get(actor).trust;
    const bTrust = new BeliefTable(witnessB).get(actor).trust;

    // Both should be negative; B's drop should be steeper than A's.
    assert.ok(aTrust > bTrust + 0.005,
        `expected in-group cushion: aTrust=${aTrust}, bTrust=${bTrust}`);
});
