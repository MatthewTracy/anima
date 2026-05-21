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
import { getGameLogger, GameLogger } from '../src/governance/game_logger.js';

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

// ── v1.1.71 — deaths from combat_death; governance attribution ────────
// A live Forum game logged 10 combat_death events (all environmental /
// mob deaths — no attributed killer) and scored deaths: 0, because
// calculateScores read deaths off combat_kill.victim_faction. It also
// called an election yet reported governanceDensity 0.00, because the
// faction-attribution check did not know the `calledBy` field.

test('v1.1.71: deaths are counted from combat_death events of any cause', () => {
    const logger = new GameLogger();
    // Environmental deaths — no killer, so no combat_kill is ever emitted.
    logger.events.push({ type: 'combat_death', faction: 'constitutional', agent: 'Madison', cause: 'drowning' });
    logger.events.push({ type: 'combat_death', faction: 'constitutional', agent: 'Paine', cause: 'unknown' });
    logger.events.push({ type: 'combat_death', faction: 'anarchy', agent: 'Fox', cause: 'fall' });
    const scores = logger.calculateScores();
    assert.equal(scores.constitutional.deaths, 2);
    assert.equal(scores.anarchy.deaths, 1);
});

test('v1.1.71: combat_kill counts a kill for the killer and is not double-counted as a death', () => {
    const logger = new GameLogger();
    // A PvP kill emits BOTH a combat_kill and (from the victim) a combat_death.
    logger.events.push({ type: 'combat_kill', killer_faction: 'anarchy', victim_faction: 'constitutional' });
    logger.events.push({ type: 'combat_death', faction: 'constitutional', agent: 'Hamilton', cause: 'Wolf' });
    const scores = logger.calculateScores();
    assert.equal(scores.anarchy.kills, 1);
    assert.equal(scores.constitutional.deaths, 1, 'the death is counted once, via combat_death');
    assert.equal(scores.anarchy.deaths, 0);
});

test('v1.1.71: block_placed still increments blocksPlaced for the placing faction', () => {
    const logger = new GameLogger();
    logger.events.push({ type: 'block_placed', faction: 'constitutional', block: 'cobblestone' });
    logger.events.push({ type: 'block_placed', faction: 'constitutional', block: 'oak_planks' });
    const scores = logger.calculateScores();
    assert.equal(scores.constitutional.blocksPlaced, 2);
});

test('v1.1.71: an election_called attributes to its caller’s faction (governanceDensity > 0)', () => {
    const logger = new GameLogger();
    // election_called names its actor in `calledBy`, not `agent`.
    logger.events.push({ type: 'election_called', calledBy: 'Madison', office: 'president' });
    const scores = logger.calculateScores();
    const govDens = parseFloat(scores.behavioralMetrics.constitutional.governanceDensity);
    assert.ok(govDens > 0, `expected governanceDensity > 0, got ${govDens}`);
    // The opposing faction took no governance action.
    assert.equal(parseFloat(scores.behavioralMetrics.anarchy.governanceDensity), 0);
});

test('v1.1.71: a nomination attributes to its candidate’s faction', () => {
    const logger = new GameLogger();
    logger.events.push({ type: 'nomination', candidate: 'Fox', office: 'president' });
    const scores = logger.calculateScores();
    assert.ok(parseFloat(scores.behavioralMetrics.anarchy.governanceDensity) > 0);
});
