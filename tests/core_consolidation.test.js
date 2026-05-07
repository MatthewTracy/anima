/**
 * Tests for core/affect/consolidation.js — sleep-style memory consolidation.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { consolidate, readConsolidatedMemory, asPromptText } from '../core/affect/consolidation.js';

const NAME = '_TestConsolidate';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

test('consolidate writes a markdown entry to consolidated_memory.md', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');
    log.record({ type: 'flog', actor: 'Y', target: NAME }, 'target');

    consolidate(NAME, { scenario: 'forum-test', clearAffectLog: false });
    const memory = readConsolidatedMemory(NAME);
    assert.ok(memory);
    assert.match(memory, /forum-test/);
    assert.match(memory, /Consolidated Memory/);
});

test('consolidate detects recurring themes', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: 'X', target: NAME }, 'target');
    log.record({ type: 'flog', actor: 'X', target: NAME }, 'target');
    log.record({ type: 'flog', actor: 'X', target: NAME }, 'target');

    const entry = consolidate(NAME, { scenario: 't', clearAffectLog: false });
    assert.ok(entry.themes.length > 0, 'expected theme detection');
    const flogTheme = entry.themes.find(t => t.pattern === 'flog');
    assert.ok(flogTheme, 'flog theme should be detected');
    assert.equal(flogTheme.count, 3);
});

test('consolidate identifies recurring others', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: 'X', target: NAME }, 'target');
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');

    const entry = consolidate(NAME, { scenario: 't', clearAffectLog: false });
    const x = entry.recurring_others.find(o => o.agent === 'X');
    assert.ok(x, 'X should be flagged as recurring antagonist');
});

test('consolidate clears AffectLog by default', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');
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
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');
    consolidate(NAME, { scenario: 'g1', clearAffectLog: true });

    log.record({ type: 'flog', actor: 'Y', target: NAME }, 'target');
    consolidate(NAME, { scenario: 'g2', clearAffectLog: true });

    const memory = readConsolidatedMemory(NAME);
    assert.match(memory, /g1/);
    assert.match(memory, /g2/);
});
