/**
 * Tests for core/souls/ — Soul class lifecycle.
 *
 * Run: node --test tests/core_souls.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Soul, listAllSouls } from '../core/souls/soul.js';

const TEST_NAME = '_TestSoul';

function clean() {
    if (existsSync(`./bots/${TEST_NAME}`)) rmSync(`./bots/${TEST_NAME}`, { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

test('Soul.seed creates soul.md with template substitutions', () => {
    const s = new Soul(TEST_NAME);
    assert.equal(s.exists(), false);
    s.seed({ personality_seed: 'test', starting_motto: 'I begin.', faction: 'tester' });
    assert.equal(s.exists(), true);
    const content = s.read();
    assert.match(content, /^# _TestSoul/m);
    assert.match(content, /"I begin\."/);
    assert.match(content, /tester/);
});

test('Soul.seed is idempotent — never overwrites existing soul', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'first', starting_motto: 'first motto.', faction: 'a' });
    const first = s.read();
    s.seed({ personality_seed: 'second', starting_motto: 'second motto.', faction: 'b' });
    const second = s.read();
    assert.equal(first, second, 'second seed should not have overwritten');
});

test('Soul.save throws if locked', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'x', starting_motto: 'x.', faction: 'x' });
    s.lock({ cause: 'test' });
    assert.throws(() => s.save('# new content'));
});

test('Soul.lock writes _died.txt marker and is idempotent', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'x', starting_motto: 'x.', faction: 'x' });
    assert.equal(s.isLocked(), false);
    s.lock({ cause: 'first lock' });
    assert.equal(s.isLocked(), true);
    s.lock({ cause: 'second lock' });   // idempotent
    assert.equal(s.isLocked(), true);
});

test('Soul.history archives prior versions on save', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'x', starting_motto: 'first.', faction: 'x' });
    s.save('# _TestSoul\n\n## My motto\n"second."\n');
    s.save('# _TestSoul\n\n## My motto\n"third."\n');
    const versions = s.history();
    assert.ok(versions.length >= 2, `expected >= 2 archived versions, got ${versions.length}`);
});

test('Soul.oneLineSummary formats correctly for alive and locked', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'x', starting_motto: 'I live.', faction: 'x' });
    let summary = s.oneLineSummary();
    assert.match(summary, /alive/);
    assert.match(summary, /"I live\."/);
    s.lock({ cause: 'test' });
    summary = s.oneLineSummary();
    assert.match(summary, /LEGEND/);
});

test('listAllSouls finds the test soul', () => {
    const s = new Soul(TEST_NAME);
    s.seed({ personality_seed: 'x', starting_motto: 'x.', faction: 'x' });
    const all = listAllSouls();
    const found = all.find(x => x.name === TEST_NAME);
    assert.ok(found, 'should find _TestSoul in listAllSouls');
});
