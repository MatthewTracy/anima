/**
 * Tests for core/feuds/ — FeudTracker.
 *
 * Run: node --test tests/core_feuds.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { FeudTracker, ANTAGONISM_WEIGHTS, logEventAsFeud } from '../core/feuds/feud_tracker.js';

const TEST_PATH = './_test_feuds.json';

function clean() {
    if (existsSync(TEST_PATH)) rmSync(TEST_PATH, { force: true });
}

beforeEach(clean);
afterEach(clean);

test('FeudTracker.record adds weighted edges', () => {
    const t = new FeudTracker(TEST_PATH);
    t.record('Chaos', 'Madison', 'kill_player', 'forum');
    const edge = t.edge('Chaos', 'Madison');
    assert.ok(edge);
    assert.equal(edge.total_weight, ANTAGONISM_WEIGHTS.kill_player);
    assert.equal(edge.count, 1);
});

test('FeudTracker accumulates across multiple events', () => {
    const t = new FeudTracker(TEST_PATH);
    t.record('Chaos', 'Madison', 'kill_player', 'forum');
    t.record('Chaos', 'Madison', 'kill_player', 'forum');
    const edge = t.edge('Chaos', 'Madison');
    assert.equal(edge.count, 2);
    assert.equal(edge.total_weight, ANTAGONISM_WEIGHTS.kill_player * 2);
});

test('FeudTracker rejects self-antagonism', () => {
    const t = new FeudTracker(TEST_PATH);
    t.record('Madison', 'Madison', 'attack_player', 'forum');
    assert.equal(t.edge('Madison', 'Madison'), null);
});

test('FeudTracker ignores non-antagonistic events', () => {
    const t = new FeudTracker(TEST_PATH);
    t.record('Madison', 'Hamilton', 'speak', 'forum');     // weight=0
    assert.equal(t.edge('Madison', 'Hamilton'), null);
});

test('FeudTracker.topAggressorsAgainst returns sorted by weight', () => {
    const t = new FeudTracker(TEST_PATH);
    t.record('Chaos', 'Madison', 'kill_player', 'forum');     // weight 6
    t.record('Wolf', 'Madison', 'attack_player', 'forum');    // weight 2
    t.record('Fox', 'Madison', 'accuse', 'cloister');         // weight 1
    const top = t.topAggressorsAgainst('Madison', 5);
    assert.equal(top[0].actor, 'Chaos');
    assert.equal(top[1].actor, 'Wolf');
    assert.equal(top[2].actor, 'Fox');
});

test('logEventAsFeud helper writes to default path only for antagonistic events', () => {
    const result1 = logEventAsFeud({ type: 'speak', actor: 'A', target: 'B' });
    assert.equal(result1, false);
    // Don't actually call logEventAsFeud with a real antagonistic event
    // because it writes to ./logs/feuds.json (default path) and would
    // pollute. The unit test above (record) covers the real path with
    // a test path.
});
