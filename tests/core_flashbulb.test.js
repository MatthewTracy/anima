/**
 * Tests for v0.76 — flashbulb-memory override on mood-congruent retrieval.
 *
 * Real cognitive psych: Brown & Kulik (1977) "Flashbulb memories".
 * Memories of unusual magnitude (e.g. learning of a death, witnessing
 * a shock) have privileged retrieval that bypasses normal mood-
 * congruency bias. Even in a sad mood, a flashbulb-grade happy memory
 * still surfaces.
 *
 * Composes v0.52 (mood-congruent retrieval) with a magnitude-based
 * override threshold of 0.7.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';

const NAME = '_TestFlashbulb';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

function pushRaw(log, e) {
    const data = log._load();
    data.log.push(e);
    log._save();
}

test('flashbulb-grade dissonant memory outranks a smaller congruent one', () => {
    const log = new AffectLog(NAME);
    // Drive mood negative
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_bad', valence: -0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    // A medium-magnitude congruent (negative) memory: mag 0.55 × 1.0 = 0.55
    pushRaw(log, { type: 'medium_neg', valence: -0.5, arousal: 1.0, magnitude: 0.55, at: 1, role: 'witness' });
    // A flashbulb-grade dissonant (positive) memory: mag 0.95 — should override
    pushRaw(log, { type: 'flash_pos', valence: +0.95, arousal: 1.0, magnitude: 0.95, at: 2, role: 'witness' });

    const cong = log.congruentMoments(2);
    const types = cong.map(e => e.type);
    // Without flashbulb override: 0.55 × 1.0 = 0.55 (medium_neg) vs
    //   0.95 × 0.4 = 0.38 (flash_pos) — neg would win.
    // With flashbulb override at mag=0.95 (full overshoot above 0.7),
    //   congruent goes to 1.0 → 0.95 × 1.0 = 0.95, which beats 0.55.
    assert.equal(types[0], 'flash_pos',
        `flashbulb should outrank, got order: ${types.join(', ')}`);
});

test('sub-flashbulb dissonant memory still gets full discount', () => {
    const log = new AffectLog(NAME);
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_bad', valence: -0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    // Congruent at 0.55 vs dissonant at 0.65 (BELOW flashbulb threshold of 0.7)
    pushRaw(log, { type: 'normal_neg', valence: -0.5, arousal: 1.0, magnitude: 0.55, at: 1, role: 'witness' });
    pushRaw(log, { type: 'normal_pos', valence: +0.5, arousal: 1.0, magnitude: 0.65, at: 2, role: 'witness' });

    const cong = log.congruentMoments(2);
    const types = cong.map(e => e.type);
    // 0.55 × 1.0 = 0.55 (congruent neg) vs 0.65 × 0.4 = 0.26 (dissonant pos, sub-flashbulb)
    // neg should win.
    assert.equal(types[0], 'normal_neg',
        `sub-flashbulb dissonant should NOT override, got order: ${types.join(', ')}`);
});

test('flashbulb override scales with magnitude (partial-override case)', () => {
    const log = new AffectLog(NAME);
    for (let i = 0; i < 8; i++) {
        pushRaw(log, { type: 'recent_bad', valence: -0.6, arousal: 0.7, magnitude: 0.30, at: 100 + i, role: 'witness' });
    }
    // Mid-flashbulb: mag 0.85 → overshoot 0.15 / 0.30 = 0.5 → congruent ≈ 0.7
    // Score: 0.85 × 0.7 = 0.60
    pushRaw(log, { type: 'mid_flash_pos', valence: +0.85, arousal: 1.0, magnitude: 0.85, at: 1, role: 'witness' });
    // Congruent at 0.55 → score 0.55
    pushRaw(log, { type: 'normal_neg', valence: -0.5, arousal: 1.0, magnitude: 0.55, at: 2, role: 'witness' });

    const cong = log.congruentMoments(2);
    // mid_flash_pos (0.60) should narrowly outrank normal_neg (0.55)
    assert.equal(cong[0].type, 'mid_flash_pos',
        `partial flashbulb at mag 0.85 should narrowly outrank a small congruent`);
});
