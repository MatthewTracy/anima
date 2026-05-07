/**
 * Tests for core/souls/lineage.js — Successor mechanic.
 *
 * Run: node --test tests/core_lineage.test.js
 *
 * v1.1.37: pin ANIMA_NO_PANTHEON BEFORE importing Soul so direct
 * test invocations don't leak _Test* epitaphs into pantheon.md.
 */

process.env.ANIMA_NO_PANTHEON = '1';

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Soul } from '../core/souls/soul.js';
import { createSuccessor, getLineage, asPromptText } from '../core/souls/lineage.js';

const A = '_TestAncestor';
const B = '_TestSuccessor';
const C = '_TestGrandchild';

function clean() {
    for (const n of [A, B, C]) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('createSuccessor rejects living ancestor', () => {
    const s = new Soul(A);
    s.seed({ personality_seed: 'x', starting_motto: 'still alive', faction: 'x' });
    // Ancestor not locked
    assert.throws(() => createSuccessor(A, B), /still alive/);
});

test('createSuccessor rejects nonexistent ancestor', () => {
    assert.throws(() => createSuccessor('NobodyEverLived', B), /no soul to inherit/);
});

test('createSuccessor rejects same-name', () => {
    assert.throws(() => createSuccessor(A, A), /same name as the ancestor/);
});

test('createSuccessor produces a soul with ancestral memory section', () => {
    const ancestor = new Soul(A);
    ancestor.seed({ personality_seed: 'founder', starting_motto: 'I begin.', faction: 'x' });
    ancestor.lock({ cause: 'test death' });
    const result = createSuccessor(A, B, { personality_seed: 'inheritor', starting_motto: 'I follow.' });
    assert.equal(result.depth, 1);
    const successorSoul = new Soul(B).read();
    assert.match(successorSoul, /Ancestral memory/);
    assert.match(successorSoul, new RegExp(A));
});

test('getLineage returns chain backward from successor', () => {
    const ancestor = new Soul(A);
    ancestor.seed({ personality_seed: 'x', starting_motto: 'a', faction: 'x' });
    ancestor.lock({ cause: 'd' });
    createSuccessor(A, B, { personality_seed: 'x', starting_motto: 'b' });
    const lineage = getLineage(B);
    assert.equal(lineage.parent, A);
    assert.equal(lineage.depth, 1);
    assert.deepEqual(lineage.lineage, [A]);
});

test('Multi-generation: A → B → C', () => {
    const a = new Soul(A); a.seed({ personality_seed: 'x', starting_motto: 'a', faction: 'x' }); a.lock({ cause: 'd' });
    createSuccessor(A, B, { personality_seed: 'x', starting_motto: 'b' });
    new Soul(B).lock({ cause: 'd' });
    createSuccessor(B, C, { personality_seed: 'x', starting_motto: 'c' });
    const lineage = getLineage(C);
    assert.equal(lineage.depth, 2);
    assert.deepEqual(lineage.lineage, [B, A]);
});

test('asPromptText for root-of-line returns clean empty message', () => {
    const text = asPromptText('_NeverHadAncestor');
    assert.match(text, /root of your line/);
});

test('asPromptText for successor includes ancestor motto', () => {
    const a = new Soul(A);
    a.seed({ personality_seed: 'x', starting_motto: 'I outlast.', faction: 'x' });
    a.lock({ cause: 'killed by Chaos' });
    createSuccessor(A, B, { personality_seed: 'x', starting_motto: 'I follow.' });
    const text = asPromptText(B);
    assert.match(text, /I outlast/);
    assert.match(text, /killed by Chaos/);
});
