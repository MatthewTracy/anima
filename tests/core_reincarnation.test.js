/**
 * Tests for core/reincarnation/reincarnation.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Soul } from '../core/souls/soul.js';
import { reincarnate, reincarnationOf, pastLives } from '../core/reincarnation/reincarnation.js';

const A = '_TestReinA';
const B = '_TestReinB';
const C = '_TestReinC';

function clean() {
    for (const n of [A, B, C]) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('reincarnate rejects living ancestor', () => {
    const s = new Soul(A);
    s.seed({ personality_seed: 'x', starting_motto: 'a', faction: 'x' });
    assert.throws(() => reincarnate(A, B), /still alive/);
});

test('reincarnate rejects same names', () => {
    assert.throws(() => reincarnate(A, A));
});

test('reincarnate rejects ancestor with no soul', () => {
    assert.throws(() => reincarnate('NobodyEverLived', B), /no soul/);
});

test('hazy reincarnation includes past-life section', () => {
    const a = new Soul(A);
    a.seed({ personality_seed: 'I outlasted', starting_motto: 'I outlast.', faction: 'x' });
    a.lock({ cause: 'old age' });
    reincarnate(A, B, { hazy: true });
    const newSoul = new Soul(B).read();
    assert.match(newSoul, /Past life/);
    assert.match(newSoul, /I outlast/);
    assert.match(newSoul, new RegExp(A));
});

test('reincarnationOf returns the record', () => {
    const a = new Soul(A); a.seed({ personality_seed: 'x', starting_motto: 'a', faction: 'x' }); a.lock({ cause: 'd' });
    reincarnate(A, B);
    const rec = reincarnationOf(B);
    assert.equal(rec.priorIdentity, A);
    assert.equal(rec.reincarnatedAs, B);
});

test('pastLives walks the chain backward', () => {
    const a = new Soul(A); a.seed({ personality_seed: 'x', starting_motto: 'a', faction: 'x' }); a.lock({ cause: 'd' });
    reincarnate(A, B);
    new Soul(B).lock({ cause: 'd2' });
    reincarnate(B, C);
    const lives = pastLives(C);
    assert.deepEqual(lives, [A, B]);
});
