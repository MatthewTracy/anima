/**
 * Tests for v0.78 — shared core/cognition/dissonance.js detector.
 *
 * The DMN line tests in core_dissonance.test.js still exercise the
 * full integration (DMN voice). These focus on the detector primitive
 * itself: thresholds, recentN windowing, sort order, structure of the
 * returned object.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { detectDissonance, _CONSTANTS } from '../core/cognition/dissonance.js';

const NAME = '_TestDissonanceModule';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

test('no agent → none', () => {
    const r = detectDissonance(null);
    assert.equal(r.level, 'none');
    assert.equal(r.entries.length, 0);
    assert.equal(r.strongest, null);
});

test('two negative-valence actor entries → loud', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: NAME, target: 'X' }, 'actor');
    log.record({ type: 'attack_player', actor: NAME, target: 'Y' }, 'actor');
    const r = detectDissonance(NAME);
    assert.equal(r.level, 'loud');
    assert.equal(r.entries.length, 2);
    assert.ok(r.strongest);
});

test('one strong negative-valence actor entry → soft', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: NAME, target: 'X' }, 'actor');
    const r = detectDissonance(NAME);
    assert.equal(r.level, 'soft');
});

test('one mild negative actor entry → none', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: NAME, target: 'X' }, 'actor');
    const r = detectDissonance(NAME);
    // flog magnitude (0.65 × 0.70 = 0.455) is below STRONG_MAGNITUDE 0.55
    assert.equal(r.level, 'none');
});

test('victim entries (role=target) ignored', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'attack_player', actor: 'Other', target: NAME }, 'target');
    log.record({ type: 'attack_player', actor: 'Other', target: NAME }, 'target');
    const r = detectDissonance(NAME);
    assert.equal(r.level, 'none');
});

test('entries sorted by magnitude desc; strongest is first', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'flog', actor: NAME, target: 'X' }, 'actor');         // mag ~0.45
    log.record({ type: 'kill_player', actor: NAME, target: 'Y' }, 'actor');  // mag 1.0
    log.record({ type: 'attack_player', actor: NAME, target: 'Z' }, 'actor'); // mag 0.48
    const r = detectDissonance(NAME);
    assert.equal(r.entries[0].type, 'kill_player');
    assert.ok(r.entries[0].magnitude >= r.entries[1].magnitude);
});

test('recentN window respected (DMN uses 10, evolution uses Infinity)', () => {
    const log = new AffectLog(NAME);
    // Pad the log with old neutral entries (won't match anyway)
    for (let i = 0; i < 9; i++) {
        log.record({ type: 'speak', actor: NAME }, 'actor');   // valence 0
    }
    // Now add one actor-negative way back, then a recent one
    log.record({ type: 'attack_player', actor: NAME, target: 'A' }, 'actor');  // 10th most recent → in window
    log.record({ type: 'attack_player', actor: NAME, target: 'B' }, 'actor');  // most recent

    const within = detectDissonance(NAME, { recentN: 10 });
    const all    = detectDissonance(NAME, { recentN: Infinity });
    assert.ok(all.entries.length >= within.entries.length);
});

test('exposed thresholds are sane', () => {
    assert.ok(_CONSTANTS.NEGATIVE_THRESHOLD < 0);
    assert.ok(_CONSTANTS.STRONG_MAGNITUDE > 0 && _CONSTANTS.STRONG_MAGNITUDE < 1);
});
