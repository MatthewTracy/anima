/**
 * Tests for core/affect/affect.js — amygdala-style emotional tagging.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { tagEvent, tagEventForWitness, AffectLog } from '../core/affect/affect.js';

const NAME = '_TestAffect';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
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
    log.record({ type: 'kill_player', actor: 'X', target: NAME, turn: 2 }, 'target');
    log.record({ type: 'lectio', actor: NAME, turn: 3 }, 'actor');
    const top = log.topMoments(3);
    // kill_player (target) should be first — highest magnitude
    assert.equal(top[0].type, 'kill_player');
});

test('AffectLog.currentMood produces a label', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: 'X', target: NAME, turn: 1 }, 'target');
    log.record({ type: 'flog', actor: 'X', target: NAME, turn: 2 }, 'target');
    const mood = log.currentMood();
    // After two devastating witnessed events, mood should be devastated/shaken
    assert.ok(['devastated', 'shaken', 'tense'].includes(mood.label),
        `expected dark mood label, got ${mood.label}`);
});

test('AffectLog.decay reduces magnitudes', () => {
    const log = new AffectLog(NAME);
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');
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
    log.record({ type: 'kill_player', actor: 'X', target: NAME }, 'target');
    const text = log.asPromptText();
    assert.match(text, /YOUR FELT STATE/);
    assert.match(text, /(devastated|shaken|tense)/);
});

test('AffectLog.asPromptText empty when no events recorded', () => {
    const log = new AffectLog(NAME);
    assert.equal(log.asPromptText(), '');
});
