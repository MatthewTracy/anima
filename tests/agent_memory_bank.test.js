/**
 * Tests for src/agent/memory_bank.js — the agent's place-coordinate store.
 *
 * v1.1.69: first coverage of the src/agent/ runtime layer, which had
 * zero tests despite the audit finding five real bugs in it.
 * MemoryBank is 100% pure (no bot, no I/O) — a clean starting point.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBank } from '../src/agent/memory_bank.js';

test('rememberPlace + recallPlace round-trip', () => {
    const mb = new MemoryBank();
    mb.rememberPlace('home', 10, 64, -20);
    assert.deepEqual(mb.recallPlace('home'), [10, 64, -20]);
});

test('recallPlace of an unknown name returns undefined', () => {
    const mb = new MemoryBank();
    assert.equal(mb.recallPlace('nowhere'), undefined);
});

test('rememberPlace overwrites an existing place', () => {
    const mb = new MemoryBank();
    mb.rememberPlace('base', 1, 2, 3);
    mb.rememberPlace('base', 9, 9, 9);
    assert.deepEqual(mb.recallPlace('base'), [9, 9, 9]);
});

test('getKeys joins remembered place names', () => {
    const mb = new MemoryBank();
    assert.equal(mb.getKeys(), '');
    mb.rememberPlace('home', 0, 0, 0);
    mb.rememberPlace('mine', 5, 5, 5);
    assert.equal(mb.getKeys(), 'home, mine');
});

test('getJson / loadJson round-trip', () => {
    const a = new MemoryBank();
    a.rememberPlace('spawn', 0, 70, 0);
    a.rememberPlace('cave', -30, 12, 44);
    const json = a.getJson();

    const b = new MemoryBank();
    b.loadJson(json);
    assert.deepEqual(b.recallPlace('spawn'), [0, 70, 0]);
    assert.deepEqual(b.recallPlace('cave'), [-30, 12, 44]);
    assert.equal(b.getKeys(), 'spawn, cave');
});

test('a fresh MemoryBank has no places', () => {
    const mb = new MemoryBank();
    assert.deepEqual(mb.getJson(), {});
    assert.equal(mb.getKeys(), '');
});
