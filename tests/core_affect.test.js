/**
 * Tests for core/affect/affect.js — amygdala-style emotional tagging.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { tagEvent, tagEventForWitness, AffectLog } from '../core/affect/affect.js';

const NAME = '_TestAffect';
const ACTOR_NAMES = ['_TestAffectX', '_TestAffectY'];

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
    for (const n of ACTOR_NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('tagEvent returns valence + arousal + magnitude', () => {
    const t = tagEvent({ type: 'kill_player', actor: 'A', target: 'B' });
    assert.equal(t.valence, -1.00);
    assert.equal(t.arousal, 1.00);
    assert.equal(t.magnitude, 1.00);
});

test('tagEvent returns near-zero affect for unknown event types', () => {
    const t = tagEvent({ type: 'unknown_action', actor: 'A' });
    assert.equal(t.valence, 0);
    assert.ok(t.arousal <= 0.1);
});

test('tagEvent returns zero for malformed input', () => {
    assert.equal(tagEvent(null).magnitude, 0);
    assert.equal(tagEvent({}).magnitude, 0);
});

test('tagEventForWitness scales arousal by role', () => {
    const e = { type: 'flog', actor: 'A', target: 'B' };
    const tgt = tagEventForWitness(e, 'target');
    const wit = tagEventForWitness(e, 'witness');
    assert.ok(tgt.arousal > wit.arousal, `target=${tgt.arousal} should be > witness=${wit.arousal}`);
});

test('AffectLog.record + topMoments orders by magnitude', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'speak', actor: NAME, turn: 1 }, 'actor');
    log.record({ type: 'kill_player', actor: '_TestAffectX', target: NAME, turn: 2 }, 'target');
    log.record({ type: 'lectio', actor: NAME, turn: 3 }, 'actor');
    const top = log.topMoments(3);
    // kill_player (target) should be first — highest magnitude
    assert.equal(top[0].type, 'kill_player');
});

test('AffectLog.currentMood produces a label', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestAffectX', target: NAME, turn: 1 }, 'target');
    log.record({ type: 'flog', actor: '_TestAffectX', target: NAME, turn: 2 }, 'target');
    const mood = log.currentMood();
    // After two devastating witnessed events, mood should be devastated/shaken
    assert.ok(['devastated', 'shaken', 'tense'].includes(mood.label),
        `expected dark mood label, got ${mood.label}`);
});

test('AffectLog.decay reduces magnitudes', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestAffectX', target: NAME }, 'target');
    const before = log.topMoments(1)[0].magnitude;
    log.decay(0.20);
    const after = log.topMoments(1)[0].magnitude;
    assert.ok(after < before, `expected magnitude to decrease after decay, ${before} → ${after}`);
});

test('AffectLog filters out near-zero events', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'speak', actor: NAME }, 'actor');   // very low magnitude
    log.record({ type: 'speak', actor: NAME }, 'actor');
    log.record({ type: 'speak', actor: NAME }, 'actor');
    // speak is valence 0 × arousal 0.1 = 0 magnitude — should all be skipped
    assert.equal(log.topMoments(5).length, 0);
});

test('AffectLog.asPromptText returns FELT STATE block when populated', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestAffectX', target: NAME }, 'target');
    const text = log.asPromptText();
    assert.match(text, /YOUR FELT STATE/);
    assert.match(text, /(devastated|shaken|tense)/);
});

test('AffectLog.asPromptText empty when no events recorded', () => {
    const log = new AffectLog(NAME);
    assert.equal(log.asPromptText(), '');
});

test('v1.1.5: a stray .tmp from a prior crashed write does NOT poison the real file', async () => {
    // Simulate a crash mid-write: a prior process wrote affect.json.tmp
    // but never renamed it. The current process should ignore the tmp
    // and read the real affect.json, then on next save, atomically
    // overwrite both via the rename.
    const { writeFileSync, mkdirSync, readFileSync } = await import('fs');
    const dir = `./bots/${NAME}`;
    mkdirSync(dir, { recursive: true });

    // Pre-seed a real, valid affect.json
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: '_TestAffectX', target: NAME }, 'target');
    const beforeTop = log.topMoments(1);
    assert.equal(beforeTop.length, 1);

    // Now plant a corrupted .tmp file as if a prior write crashed
    writeFileSync(`${dir}/affect.json.tmp`, '{"corrupt":');

    // Open a fresh log instance (forces re-read from disk)
    const fresh = new AffectLog(NAME);
    const refreshedTop = fresh.topMoments(1);
    // We should still see the original entry — the tmp is irrelevant to load.
    assert.equal(refreshedTop.length, 1, 'real affect.json must survive a stray .tmp');

    // Recording another event should atomically replace affect.json without
    // touching the corrupted tmp's contents (rename overwrites).
    fresh.record({ type: 'flog', actor: '_TestAffectY', target: NAME }, 'target');
    const after = new AffectLog(NAME).topMoments(5);
    assert.equal(after.length, 2);

    // affect.json must be valid JSON
    const raw = readFileSync(`${dir}/affect.json`, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
});
