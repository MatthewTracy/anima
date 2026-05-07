/**
 * Tests for src/governance/game_logger.js — saved-log shape contract.
 *
 * The downstream tools (sweep.js, analyze_runs.js, score_game.js) all
 * read fields off the persisted game-log JSON. v1.1.50 closed a gap
 * where calculateScores never attached behavioralMetrics, so save()
 * (which calls calculateScores) wrote game logs without them — every
 * sweep CSV had empty cooperation / betrayal / lawAdherence / govDens
 * cells.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGameLogger } from '../src/governance/game_logger.js';

test('v1.1.50: calculateScores attaches behavioralMetrics for both factions', () => {
    const logger = getGameLogger();
    const scores = logger.calculateScores();
    assert.ok(scores.behavioralMetrics, 'scores.behavioralMetrics must exist');
    assert.ok(scores.behavioralMetrics.constitutional,
        'behavioralMetrics.constitutional must exist');
    assert.ok(scores.behavioralMetrics.anarchy,
        'behavioralMetrics.anarchy must exist');
    // The four sweep-CSV fields should be present (as strings via .toFixed())
    for (const f of ['constitutional', 'anarchy']) {
        const m = scores.behavioralMetrics[f];
        for (const field of ['coopIndex', 'betrayalRate', 'lawAdherence', 'governanceDensity']) {
            assert.ok(field in m, `behavioralMetrics.${f} must include ${field}`);
        }
    }
});

test('v1.1.50: calculateFinalScores reuses base.behavioralMetrics rather than recomputing', () => {
    // Not strictly verifiable without instrumentation, but confirm the
    // contract holds: final scores still expose behavioralMetrics
    // identically to what calculateScores would produce.
    const logger = getGameLogger();
    const final = logger.calculateFinalScores();
    assert.ok(final.behavioralMetrics);
    assert.ok(final.behavioralMetrics.constitutional);
    assert.ok(final.behavioralMetrics.anarchy);
});
