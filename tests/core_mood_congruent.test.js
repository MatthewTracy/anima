/**
 * Tests for mood-congruent memory retrieval (Bower 1981, Eich 1995).
 *
 * Confirms:
 *   - neutral mood → congruentMoments matches topMoments
 *   - negative mood → negative event surfaces above a slightly bigger positive
 *   - positive mood → positive event surfaces above a slightly bigger negative
 *   - dissonant memories are NOT excluded entirely (never zero)
 *   - integration with DMN: a sad agent's monologue surfaces a sad replay
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { ruminate } from '../core/cognition/dmn.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';

const NAME = '_TestMoodCongruent';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

/**
 * Push an event into a log directly with a controlled magnitude. We bypass
 * the normal record() path so we can construct the comparison cleanly.
 */
function pushRaw(log, entry) {
    const data = log._load();
    data.log.push(entry);
    log._save();
}

test('neutral mood: congruentMoments matches topMoments', () => {
    const log = new AffectLog(NAME);
    pushRaw(log, { type: 'a', valence: +0.3, arousal: 0.4, magnitude: 0.30, at: 1, role: 'witness' });
    pushRaw(log, { type: 'b', valence: -0.3, arousal: 0.4, magnitude: 0.30, at: 2, role: 'witness' });
    // Recent log is balanced → mood valence should sit inside the neutral band.
    const cong = log.congruentMoments(5);
    const top  = log.topMoments(5);
    assert.deepEqual(cong.map(e => e.type), top.map(e => e.type));
});

test('negative mood pulls a slightly smaller negative memory above a positive one', () => {
    const log = new AffectLog(NAME);
    // Recent entries skew negative (drives mood)
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_bad', valence: -0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    // Two competing "older" memorable events:
    //   a positive one at magnitude 0.55
    //   a negative one at magnitude 0.50  (smaller!)
    pushRaw(log, { type: 'old_positive', valence: +0.6, arousal: 0.9, magnitude: 0.55, at: 1, role: 'witness' });
    pushRaw(log, { type: 'old_negative', valence: -0.5, arousal: 1.0, magnitude: 0.50, at: 2, role: 'witness' });

    // currentMood drives off the LAST 10 entries — we put 8 recent_bad +
    // the 2 old, so mood is solidly negative.
    const mood = log.currentMood();
    assert.ok(mood.valence < -0.1, `expected negative mood, got ${mood.valence}`);

    const cong = log.congruentMoments(2);
    // Even though old_positive has higher raw magnitude, the negative-mood
    // congruency boost (0.50 × 1.0 = 0.50) beats the positive's penalty
    // (0.55 × 0.4 = 0.22). So old_negative should rank above old_positive.
    const types = cong.map(e => e.type);
    const idxNeg = types.indexOf('old_negative');
    const idxPos = types.indexOf('old_positive');
    assert.ok(idxNeg >= 0, `expected old_negative in top 2, got ${types}`);
    if (idxPos >= 0) {
        assert.ok(idxNeg < idxPos, `expected old_negative ranked above old_positive: ${types}`);
    }
});

test('positive mood pulls a smaller positive memory above a negative one', () => {
    const log = new AffectLog(NAME);
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_good', valence: +0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    pushRaw(log, { type: 'old_negative', valence: -0.6, arousal: 0.9, magnitude: 0.55, at: 1, role: 'witness' });
    pushRaw(log, { type: 'old_positive', valence: +0.5, arousal: 1.0, magnitude: 0.50, at: 2, role: 'witness' });

    const mood = log.currentMood();
    assert.ok(mood.valence > 0.1, `expected positive mood, got ${mood.valence}`);

    const cong = log.congruentMoments(2);
    const types = cong.map(e => e.type);
    const idxPos = types.indexOf('old_positive');
    const idxNeg = types.indexOf('old_negative');
    assert.ok(idxPos >= 0, `expected old_positive in top 2, got ${types}`);
    if (idxNeg >= 0) {
        assert.ok(idxPos < idxNeg, `expected old_positive ranked above old_negative: ${types}`);
    }
});

test('dissonant memories are never excluded — accessibility, just lower priority', () => {
    const log = new AffectLog(NAME);
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_bad', valence: -0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    // Only a positive memory exists in the "old" tier.
    pushRaw(log, { type: 'lone_positive', valence: +0.5, arousal: 0.9, magnitude: 0.40, at: 1, role: 'witness' });

    const cong = log.congruentMoments(10);
    assert.ok(cong.some(e => e.type === 'lone_positive'),
        'positive memory must still be retrievable in negative mood');
});

test('empty log → empty result, no throw', () => {
    const log = new AffectLog(NAME);
    assert.deepEqual(log.congruentMoments(5), []);
});

test('integration: DMN replay surfaces a mood-congruent moment', () => {
    // Bias mood negative; ensure a positive moment is present but doesn't dominate.
    const log = new AffectLog(NAME);
    for (let i = 0; i < 6; i++) {
        log.record({ type: 'attack_player', actor: '_TestMoodActor', target: NAME }, 'target');
    }
    log.record({ type: 'repair', actor: '_TestMoodAlly' }, 'witness');

    const beliefs = new BeliefTable(NAME);
    beliefs.set('_TestMoodActor', -0.7, 'attacked me');
    beliefs.set('_TestMoodAlly', +0.3, 'fixed something');

    const monologue = ruminate(NAME, { persist: false });
    // The mood-congruent (negative) memory of Brutus should surface in
    // the replay line, since the current mood is sour.
    assert.match(monologue, /_TestMoodActor/, `expected Brutus replay: ${monologue}`);
});
