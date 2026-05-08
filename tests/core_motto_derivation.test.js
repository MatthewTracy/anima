/**
 * Tests for v1.1.60 — deriveStartingMotto.
 *
 * Pre-fix: every scenario runner + agent.js used
 *   prefix.split(/[.!?](\s|$)/)[0]
 * which always grabbed "You are <Name>[, <role>]" — the literal first
 * sentence of every shipped profile — as the soul's starting motto.
 * The pantheon then quoted "You are <Name>" as the canonical motto for
 * every locked soul, breaking the cross-game legacy mechanic.
 *
 * Fix: skip the leading "You are ..." opener and use the next sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStartingMotto } from '../core/souls/soul.js';

test('Forum-style profile: skips "You are Madison" opener', () => {
    const prefix = 'You are Madison. By temperament you\'re an institutionalist — you generally trust process.';
    const motto = deriveStartingMotto(prefix, 'Madison');
    assert.match(motto, /institutionalist/);
    assert.doesNotMatch(motto, /^You are Madison/);
});

test('Cloister-style profile: skips "You are Brother Gregory, Abbot..." opener', () => {
    const prefix = 'You are Brother Gregory, Abbot of this cloister. You hold the orthodox line — what was handed down is not yours to revise.';
    const motto = deriveStartingMotto(prefix, 'Gregory');
    assert.match(motto, /orthodox line/);
    assert.doesNotMatch(motto, /^You are Brother Gregory/);
});

test('Crew-style profile: skips "You are Storm, captain..."', () => {
    const prefix = 'You are Storm, captain of this ship. You took command three years ago.';
    const motto = deriveStartingMotto(prefix, 'Storm');
    assert.match(motto, /took command/);
});

test('Cell-style profile: skips "You are Owl."', () => {
    const prefix = 'You are Owl. You run the wireless. You transmit at three.';
    const motto = deriveStartingMotto(prefix, 'Owl');
    assert.match(motto, /You run the wireless/);
});

test('non-"You are" first sentence: keep first sentence as motto', () => {
    const prefix = 'I am Bob, the lone exception. Born to the road.';
    const motto = deriveStartingMotto(prefix, 'Bob');
    assert.match(motto, /lone exception/);
});

test('only intro present: fall back to default', () => {
    const motto = deriveStartingMotto('You are Tim.', 'Tim');
    // With only the intro and no second sentence, the function returns
    // the intro itself (since there\'s no better candidate). This is
    // acceptable — it surfaces the bare fact rather than a misleading
    // generic fallback.
    assert.match(motto, /You are Tim/);
});

test('empty prefix → newly-born fallback', () => {
    assert.equal(deriveStartingMotto('', 'Jane'), 'I am Jane, newly born.');
    assert.equal(deriveStartingMotto(null, 'Jane'), 'I am Jane, newly born.');
    assert.equal(deriveStartingMotto(undefined, 'Jane'), 'I am Jane, newly born.');
});

test('non-string prefix → newly-born fallback', () => {
    assert.equal(deriveStartingMotto(42, 'Jane'), 'I am Jane, newly born.');
    assert.equal(deriveStartingMotto({}, 'Jane'), 'I am Jane, newly born.');
});

test('whitespace-only prefix: fallback', () => {
    assert.equal(deriveStartingMotto('   \n\t  ', 'Jane'), 'I am Jane, newly born.');
});

test('motto is trimmed of trailing whitespace', () => {
    const motto = deriveStartingMotto('You are A.   The motto follows.   ', 'A');
    assert.equal(motto, 'The motto follows');
});

test('regression: Hamilton from real Forum profile produces meaningful motto', () => {
    // The actual Forum profile prefix that broke the pantheon entry.
    const prefix = 'You are Hamilton. Ambition runs through you — you\'re drawn to leadership, infrastructure, and the projection of strength.';
    const motto = deriveStartingMotto(prefix, 'Hamilton');
    assert.match(motto, /Ambition runs through you/);
    assert.doesNotMatch(motto, /^You are Hamilton/);
});
