/**
 * Tests for core/beliefs/ — BeliefTable and RecursiveBeliefTable.
 *
 * Run: node --test tests/core_beliefs.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../core/beliefs/recursive_belief.js';

const OWNER = '_TestBeliever';

function clean() {
    if (existsSync(`./bots/${OWNER}`)) rmSync(`./bots/${OWNER}`, { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

test('BeliefTable.update accumulates trust over multiple events', () => {
    const t = new BeliefTable(OWNER);
    t.update('Hamilton', 0.20, 'shared iron');
    t.update('Hamilton', 0.10, 'voted with me');
    const ranked = t.rankedTargets();
    const ham = ranked.find(r => r.name === 'Hamilton');
    assert.ok(ham);
    assert.ok(Math.abs(ham.trust - 0.30) < 0.001, `expected 0.30, got ${ham.trust}`);
});

test('BeliefTable trust clamps to [-1, 1]', () => {
    const t = new BeliefTable(OWNER);
    for (let i = 0; i < 20; i++) t.update('Fox', -0.30, 'spam');
    const ranked = t.rankedTargets();
    const fox = ranked.find(r => r.name === 'Fox');
    assert.equal(fox.trust, -1.0);
});

test('BeliefTable rejects self-belief', () => {
    const t = new BeliefTable(OWNER);
    t.update(OWNER, 0.5, 'self-test');
    const ranked = t.rankedTargets();
    assert.equal(ranked.find(r => r.name === OWNER), undefined);
});

test('BeliefTable evidence FIFOs at MAX_EVIDENCE_ENTRIES', () => {
    const t = new BeliefTable(OWNER);
    for (let i = 0; i < 12; i++) t.update('Wolf', 0.01, `event ${i}`);
    const wolfEntry = t.get('Wolf');
    assert.ok(wolfEntry.evidence.length <= 6, `expected ≤6 evidence entries, got ${wolfEntry.evidence.length}`);
});

test('BeliefTable.asPromptText includes ranked targets', () => {
    const t = new BeliefTable(OWNER);
    t.update('Hamilton', 0.40, 'r1');
    t.update('Fox', -0.50, 'r2');
    const text = t.asPromptText();
    assert.match(text, /Hamilton/);
    assert.match(text, /Fox/);
    assert.match(text, /YOUR BELIEFS/);
});

test('RecursiveBeliefTable.setPerception tracks confidence', () => {
    const r = new RecursiveBeliefTable(OWNER);
    r.setPerception('Hamilton', 0.60, 0.80, 'he praised me');
    const p = r.getPerception('Hamilton');
    assert.ok(Math.abs(p.perceived_trust_of_me - 0.60) < 0.001);
    assert.ok(Math.abs(p.confidence - 0.80) < 0.001);
});

test('RecursiveBeliefTable rejects self-perception', () => {
    const r = new RecursiveBeliefTable(OWNER);
    r.setPerception(OWNER, 0.5, 0.5, 'self');
    const p = r.getPerception(OWNER);
    assert.equal(p, null);
});
