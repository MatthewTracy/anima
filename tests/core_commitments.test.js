/**
 * Tests for core/commitments/commitment_ledger.js — binding promises.
 *
 * Run: node --test tests/core_commitments.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { CommitmentLedger, COMMITMENT_STATUS } from '../core/commitments/commitment_ledger.js';

const TEST_GAME = '_test_commitments';
const TEST_PATH = `./logs/commitments/${TEST_GAME}.json`;

function clean() {
    if (existsSync(TEST_PATH)) rmSync(TEST_PATH, { force: true });
}

beforeEach(clean);
afterEach(clean);

test('CommitmentLedger.create requires fields', () => {
    const l = new CommitmentLedger(TEST_GAME);
    assert.throws(() => l.create({ by: 'A' }));
});

test('CommitmentLedger rejects self-commitment', () => {
    const l = new CommitmentLedger(TEST_GAME);
    assert.throws(() => l.create({
        by: 'A', to: 'A', condition: 'x', consequence: 'y',
        deadline_ms: Date.now() + 60000
    }), /cannot commit to yourself/);
});

test('CommitmentLedger rejects past deadline', () => {
    const l = new CommitmentLedger(TEST_GAME);
    assert.throws(() => l.create({
        by: 'A', to: 'B', condition: 'x', consequence: 'y',
        deadline_ms: Date.now() - 1000
    }));
});

test('CommitmentLedger.fulfill marks fulfilled', () => {
    const l = new CommitmentLedger(TEST_GAME);
    const c = l.create({ by: 'A', to: 'B', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    l.fulfill(c.id, 'condition met');
    assert.equal(l.list({})[0].status, COMMITMENT_STATUS.FULFILLED);
});

test('CommitmentLedger.break_ marks broken + fires listener', () => {
    const l = new CommitmentLedger(TEST_GAME);
    let fired = false;
    l.on('broken', () => { fired = true; });
    const c = l.create({ by: 'A', to: 'B', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    l.break_(c.id, 'deadline');
    assert.equal(l.list({})[0].status, COMMITMENT_STATUS.BROKEN);
    assert.equal(fired, true);
});

test('CommitmentLedger.sweepDeadlines auto-breaks past-deadline pending', async () => {
    const l = new CommitmentLedger(TEST_GAME);
    const c = l.create({ by: 'A', to: 'B', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 50 });
    await new Promise(r => setTimeout(r, 100));
    const swept = l.sweepDeadlines();
    assert.equal(swept.length, 1);
    assert.equal(swept[0].id, c.id);
    assert.equal(swept[0].status, COMMITMENT_STATUS.BROKEN);
});

test('CommitmentLedger.list filters by involving', () => {
    const l = new CommitmentLedger(TEST_GAME);
    l.create({ by: 'A', to: 'B', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    l.create({ by: 'C', to: 'D', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    const aOnly = l.list({ involving: 'A' });
    assert.equal(aOnly.length, 1);
    assert.equal(aOnly[0].by, 'A');
});

test('CommitmentLedger.summary computes kept_rate', () => {
    const l = new CommitmentLedger(TEST_GAME);
    const a = l.create({ by: 'A', to: 'B', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    const b = l.create({ by: 'A', to: 'C', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    const c = l.create({ by: 'A', to: 'D', condition: 'x', consequence: 'y', deadline_ms: Date.now() + 60000 });
    l.fulfill(a.id, '');
    l.fulfill(b.id, '');
    l.break_(c.id, '');
    const s = l.summary();
    assert.equal(s.fulfilled, 2);
    assert.equal(s.broken, 1);
    assert.ok(Math.abs(s.kept_rate - (2/3)) < 0.01);
});
