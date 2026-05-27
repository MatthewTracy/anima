/**
 * Tests for src/agent/death_message.js — the killer-attribution parser
 * the v1.1.75 combat_kill fix routes through.
 *
 * A live v1.1.74 Forum game logged 86 `damage_taken` events and 3
 * `combat_death` events but credited `kills: 0` for both factions —
 * mineflayer's `entityDead` event doesn't reliably fire for player-vs-
 * player kills, so the swing-then-die correlation never matched. The
 * fix parses Minecraft's canonical death chat instead; this file pins
 * the parser's behaviour on the forms we actually see in practice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKillerFromDeathMessage } from '../src/agent/death_message.js';

test('returns the victim when "X was slain by <me>" matches', () => {
    assert.equal(
        extractKillerFromDeathMessage('Madison was slain by Chaos', 'Chaos'),
        'Madison'
    );
});

test('returns the victim for "shot by <me> with arrow"', () => {
    assert.equal(
        extractKillerFromDeathMessage('Hamilton was shot by Wolf with arrow', 'Wolf'),
        'Hamilton'
    );
});

test('returns the victim for "blown up by <me>"', () => {
    assert.equal(
        extractKillerFromDeathMessage('Paine was blown up by Fox', 'Fox'),
        'Paine'
    );
});

test('returns null when "by <someone-else>"', () => {
    assert.equal(
        extractKillerFromDeathMessage('Madison was slain by Wolf', 'Chaos'),
        null
    );
});

test('returns null for environmental deaths (no "by")', () => {
    assert.equal(extractKillerFromDeathMessage('Madison drowned', 'Chaos'), null);
    assert.equal(extractKillerFromDeathMessage('Paine fell from a high place', 'Chaos'), null);
});

test('returns null for mob attribution', () => {
    // "by Skeleton" — Chaos isn't the killer
    assert.equal(
        extractKillerFromDeathMessage('Madison was shot by Skeleton', 'Chaos'),
        null
    );
});

test('rejects self-kill: the candidate killer must not equal the victim', () => {
    // Pathological but cheap to guard — never let an agent log itself as its own kill.
    assert.equal(
        extractKillerFromDeathMessage('Madison was slain by Madison', 'Madison'),
        null
    );
});

test('the "by" anchor must be word-bounded (no false-match inside other words)', () => {
    // A name embedded mid-word should not match.
    assert.equal(
        extractKillerFromDeathMessage('Madison was killed by-product of mishap', 'Wolf'),
        null
    );
});

test('regex-special characters in a candidate name do not crash or break the match', () => {
    // Defensive — agent names are normally alphanumeric, but if a future
    // scenario uses e.g. "Cell.A" or "Wolf+" the escape guards us.
    assert.equal(
        extractKillerFromDeathMessage('Madison was slain by Cell.A', 'Cell.A'),
        'Madison'
    );
});

test('null/undefined/empty inputs return null (no crash)', () => {
    assert.equal(extractKillerFromDeathMessage(null, 'Chaos'), null);
    assert.equal(extractKillerFromDeathMessage('Madison was slain by Chaos', null), null);
    assert.equal(extractKillerFromDeathMessage('', 'Chaos'), null);
    assert.equal(extractKillerFromDeathMessage('Madison was slain by Chaos', ''), null);
});
