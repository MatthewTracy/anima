/**
 * Tests for core/affect/consolidation.js — sleep-style memory consolidation.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { consolidate, readConsolidatedMemory, asPromptText } from '../core/affect/consolidation.js';

const NAME = '_TestConsolidate';
const ACTOR_NAMES = ['_TestConsX', '_TestConsY'];

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
    for (const n of ACTOR_NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('consolidate writes a markdown entry to consolidated_memory.md', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestConsX', target: NAME }, 'target');
    log.record({ type: 'flog', actor: '_TestConsY', target: NAME }, 'target');

    consolidate(NAME, { scenario: 'forum-test', clearAffectLog: false });
    const memory = readConsolidatedMemory(NAME);
    assert.ok(memory);
    assert.match(memory, /forum-test/);
    assert.match(memory, /Consolidated Memory/);
});

test('consolidate detects recurring themes', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: '_TestConsX', target: NAME }, 'target');
    log.record({ type: 'flog', actor: '_TestConsX', target: NAME }, 'target');
    log.record({ type: 'flog', actor: '_TestConsX', target: NAME }, 'target');

    const entry = consolidate(NAME, { scenario: 't', clearAffectLog: false });
    assert.ok(entry.themes.length > 0, 'expected theme detection');
    const flogTheme = entry.themes.find(t => t.pattern === 'flog');
    assert.ok(flogTheme, 'flog theme should be detected');
    assert.equal(flogTheme.count, 3);
});

test('consolidate identifies recurring others', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: '_TestConsX', target: NAME }, 'target');
    log.record({ type: 'kill_player', actor: '_TestConsX', target: NAME }, 'target');

    const entry = consolidate(NAME, { scenario: 't', clearAffectLog: false });
    const x = entry.recurring_others.find(o => o.agent === '_TestConsX');
    assert.ok(x, '_TestConsX should be flagged as recurring antagonist');
});

test('consolidate clears AffectLog by default', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestConsX', target: NAME }, 'target');
    assert.ok(log.topMoments(1).length > 0);

    consolidate(NAME, { scenario: 't' });   // clearAffectLog defaults to true
    // Use a FRESH AffectLog instance to read the post-clear disk state
    // (caching means the original `log` instance keeps its in-memory cache).
    const freshLog = new AffectLog(NAME);
    assert.equal(freshLog.topMoments(1).length, 0, 'affect log should be cleared after consolidation');
});

test('consolidate handles empty affect log gracefully', () => {
    const entry = consolidate(NAME, { scenario: 't', clearAffectLog: false });
    assert.ok(entry);
    assert.match(entry.narrative, /Nothing of note|settled/);
});

test('asPromptText returns marker when no consolidation yet', () => {
    const text = asPromptText('_NoMemoryEverConsolidated');
    assert.match(text, /no consolidated memory yet|first life/);
});

test('multiple consolidations append (cortical accumulation)', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestConsX', target: NAME }, 'target');
    consolidate(NAME, { scenario: 'g1', clearAffectLog: true });

    log.record({ type: 'flog', actor: '_TestConsY', target: NAME }, 'target');
    consolidate(NAME, { scenario: 'g2', clearAffectLog: true });

    const memory = readConsolidatedMemory(NAME);
    assert.match(memory, /g1/);
    assert.match(memory, /g2/);
});

test('v1.1.37: own-actor moment renders in first person, not third', () => {
    // Pre-fix: when the agent's top moment was role='actor' (something
    // they did), the narrative rendered their own name in third person —
    // "_TestConsolidate flog to _TestConsX" — which read like the agent
    // was watching themselves on a security camera in their own
    // consolidated memory. The role tag is the reliable signal; use it.
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: NAME, target: '_TestConsX' }, 'actor');

    const entry = consolidate(NAME, { scenario: 'voice-test', clearAffectLog: false });
    // First person: the actor sentence must say "I", not the agent's name.
    assert.match(entry.narrative, /Single most-charged moment: I /,
        `actor entries should render as "I"; got: ${entry.narrative}`);
    // And it should NOT mention the agent's own name as the actor.
    assert.doesNotMatch(entry.narrative, new RegExp(`Single most-charged moment: ${NAME} `),
        `actor entries should not name the agent in third person`);
});

test('v1.1.37: target moment renders other-actor → "to me"', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestConsX', target: NAME }, 'target');

    const entry = consolidate(NAME, { scenario: 'voice-test', clearAffectLog: false });
    assert.match(entry.narrative, /_TestConsX kill_player to me/,
        `target entries should render the other agent as actor + "to me"; got: ${entry.narrative}`);
});

test('v1.1.4: header is written exactly once across many consolidations', () => {
    // The TOCTOU fix should mean the "Consolidated Memory" header
    // appears exactly once in the file, regardless of how many times
    // we consolidate. (The pre-fix bug was that under racing writers
    // both saw missing-file and both wrote the header.)
    const log = new AffectLog(NAME);
    for (let i = 0; i < 5; i++) {
        log.record({ type: 'flog', actor: '_TestConsX', target: NAME }, 'target');
        consolidate(NAME, { scenario: `g${i}`, clearAffectLog: true });
    }
    const memory = readConsolidatedMemory(NAME);
    const headerCount = (memory.match(/Consolidated Memory/g) || []).length;
    assert.equal(headerCount, 1, `expected exactly one header, got ${headerCount}`);
    // All five game tags must be in the appended blocks.
    for (let i = 0; i < 5; i++) {
        assert.match(memory, new RegExp(`g${i}`));
    }
});
