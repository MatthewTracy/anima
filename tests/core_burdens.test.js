/**
 * Tests for core/burdens/ — Burden hidden state + confession.
 *
 * Run: node --test tests/core_burdens.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Burden } from '../core/burdens/burden.js';

const NAME = '_TestBurden';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

test('Burden.assign creates and reads back', () => {
    const b = new Burden(NAME);
    assert.equal(b.exists(), false);
    b.assign({ text: 'I lied.', kind: 'sin', source: 'test' });
    assert.equal(b.exists(), true);
    const r = b.read();
    assert.equal(r.text, 'I lied.');
    assert.equal(r.kind, 'sin');
});

test('Burden.asPromptText returns empty string when no burden', () => {
    const b = new Burden(NAME);
    assert.equal(b.asPromptText(), '');
});

test('Burden.confess clears active and records history', () => {
    const b = new Burden(NAME);
    b.assign({ text: 'secret.', kind: 'secret', source: 't' });
    const rec = b.confess({ toAudience: 'public', context: 'ctx' });
    assert.ok(rec);
    assert.equal(rec.toAudience, 'public');
    assert.equal(b.exists(), false, 'burden should be cleared after confession');
    assert.equal(b.confessions().length, 1);
});

test('Burden.confess returns null if no burden', () => {
    const b = new Burden(NAME);
    assert.equal(b.confess(), null);
});

test('Burden privacy: prompt text only renders when burden present', () => {
    const b = new Burden(NAME);
    assert.equal(b.asPromptText(), '');
    b.assign({ text: 'visible to bearer only', kind: 'sin', source: 't' });
    const text = b.asPromptText();
    assert.match(text, /YOUR PRIVATE BURDEN/);
    assert.match(text, /SIN/);
});
