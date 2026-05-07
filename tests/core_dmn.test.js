/**
 * Tests for core/cognition/dmn.js — Default Mode Network rumination.
 *
 * Covers:
 *   - empty state produces empty monologue (no false rumination)
 *   - rich state produces a multi-clause monologue mentioning ally/enemy/replay
 *   - persistence: appending, truncation
 *   - readLatestMusings round-trip
 *   - asPromptText marker fallback
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { setFaction, _resetFactionCache } from '../core/identity/faction.js';
import { ruminate, readLatestMusings, asPromptText } from '../core/cognition/dmn.js';

const NAME = '_TestDMN';
const ACTOR_NAMES = ['_TestDmnX'];

function clean() {
    _resetFactionCache();
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
    for (const n of ACTOR_NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('empty agent yields empty monologue (DMN does not invent content)', () => {
    const m = ruminate(NAME, { persist: false });
    assert.equal(m, '');
});

test('rich state yields multi-clause monologue with named characters', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: '_TestDMNActor', target: NAME }, 'target');
    log.record({ type: 'repair', actor: '_TestDMNAlly' }, 'witness');

    const beliefs = new BeliefTable(NAME);
    beliefs.set('_TestDMNAlly', +0.6, 'fixed the engine');
    beliefs.set('_TestDMNActor', -0.7, 'attacked me');

    setFaction(NAME, 'crew');

    const m = ruminate(NAME, { persist: false });

    assert.ok(m.length > 60, `expected substantive monologue, got: ${m}`);
    assert.match(m, /_TestDMNAlly/);
    assert.match(m, /_TestDMNActor/);
    // mood-anchored opener should reflect the negative valence of attack
    assert.match(m, /sinking|steady|coming|sideways/);
});

test('faction is mentioned in the opener when known', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: '_TestDmnX', target: NAME }, 'target');
    setFaction(NAME, 'cell');
    const m = ruminate(NAME, { persist: false });
    assert.match(m, /cell/);
});

test('persistence writes a timestamped header and body', () => {
    new AffectLog(NAME).record({ type: 'flog', actor: '_TestDmnX', target: NAME }, 'target');
    new BeliefTable(NAME).set('_TestDmnX', -0.5, 'flogged me');

    const m = ruminate(NAME);
    const path = join('./bots', NAME, 'musings.md');
    assert.ok(existsSync(path));
    const text = readFileSync(path, 'utf8');
    assert.match(text, /^\s*\n## \d{4}-\d{2}-\d{2}/, 'expected ISO-ish header');
    assert.ok(text.includes(m), 'persisted body should contain the returned monologue');
});

test('readLatestMusings returns the body of the most recent entry', () => {
    new AffectLog(NAME).record({ type: 'attack_player', actor: 'A', target: NAME }, 'target');
    new BeliefTable(NAME).set('A', -0.6, 'hit me');
    const m1 = ruminate(NAME);

    new AffectLog(NAME).record({ type: 'repair', actor: 'B' }, 'witness');
    new BeliefTable(NAME).set('B', +0.5, 'fixed something');
    const m2 = ruminate(NAME);

    const latest = readLatestMusings(NAME);
    assert.equal(latest, m2);
    assert.notEqual(latest, m1);
});

test('asPromptText returns a marker when nothing has been ruminated', () => {
    const text = asPromptText('_NeverRuminated');
    assert.match(text, /quiet|no recent thoughts/);
});

test('asPromptText returns the framed monologue when present', () => {
    new AffectLog(NAME).record({ type: 'attack_player', actor: '_TestDmnX', target: NAME }, 'target');
    new BeliefTable(NAME).set('_TestDmnX', -0.4, 'hit me');
    ruminate(NAME);

    const text = asPromptText(NAME);
    assert.match(text, /YOUR INNER MONOLOGUE/);
    assert.match(text, /END INNER MONOLOGUE/);
});

test('musings.md is truncated when it grows past the byte cap', () => {
    // Pre-seed a large existing file
    const dir = join('./bots', NAME);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'musings.md');
    let big = '';
    for (let i = 0; i < 100; i++) {
        big += `\n## 2026-05-06T00:0${i}:00.000Z\nfiller line ${i} `.padEnd(120, 'x') + '\n';
    }
    writeFileSync(path, big);

    new AffectLog(NAME).record({ type: 'flog', actor: '_TestDmnX', target: NAME }, 'target');
    new BeliefTable(NAME).set('_TestDmnX', -0.5, 'flogged me');
    ruminate(NAME);

    const after = readFileSync(path, 'utf8');
    // Should have shrunk; absolute bound is roughly the cap + one entry.
    assert.ok(after.length < 5000, `expected truncation, file size = ${after.length}`);
    // Newest entry should still be present.
    const latest = readLatestMusings(NAME);
    assert.ok(latest.length > 0, 'newest entry must survive truncation');
});

test('rumination is deterministic for fixed inputs', () => {
    new AffectLog(NAME).record({ type: 'attack_player', actor: '_TestDmnX', target: NAME }, 'target');
    new BeliefTable(NAME).set('_TestDmnX', -0.5, 'hit me');
    setFaction(NAME, 'crew');

    const a = ruminate(NAME, { persist: false });
    const b = ruminate(NAME, { persist: false });
    assert.equal(a, b);
});
