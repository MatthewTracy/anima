/**
 * Tests for src/agent/witness.js announcement broadcasting (v1.1.74).
 *
 * The witness module had two paths:
 *  - WITNESS_TYPES — distance-gated physical sightings ([SAW]).
 *  - ANNOUNCEMENT_TYPES — added in v1.1.74. Governance events
 *    (election_called, nomination, law_proposed) reach every agent
 *    regardless of where they're standing, with a distinct [ELECTION] /
 *    [LAW] marker so the LLM can tell them apart from a physical sight.
 *
 * A live Forum game had Madison call a presidential election while the
 * Anarchy faction was 200+ blocks away. The election ran 78s and timed
 * out with "no votes cast" because nobody — not even her own Constitutional
 * faction-mates — saw it as actionable. The announcement path is the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
// Import from witness_messages.js (the pure-logic split) so this test is
// CI-safe — witness.js's mindserver_proxy → socket.io-client chain fails
// to import without node_modules.
import { formatWitnessMessage, ANNOUNCEMENT_TYPES } from '../src/agent/witness_messages.js';
const _formatWitnessMessage = formatWitnessMessage;

test('ANNOUNCEMENT_TYPES contains the three governance events', () => {
    assert.ok(ANNOUNCEMENT_TYPES.has('election_called'));
    assert.ok(ANNOUNCEMENT_TYPES.has('nomination'));
    assert.ok(ANNOUNCEMENT_TYPES.has('law_proposed'));
});

test('election_called renders the [ELECTION] marker and a usable !nominateSelf hint', () => {
    const msg = _formatWitnessMessage({
        actor: 'Madison', type: 'election_called',
        details: { office: 'president', election_id: 1 }
    }, 0);
    assert.match(msg, /^\[ELECTION\]/, 'announcement must use the [ELECTION] marker, not [SAW]');
    assert.match(msg, /Madison/);
    assert.match(msg, /president/);
    assert.match(msg, /!nominateSelf\("president"\)/, 'must include the literal nomination command');
    assert.match(msg, /!castVote\(1,/, 'must include the literal vote command with the election id');
});

test('nomination renders [ELECTION] and a literal !castVote hint with the candidate name', () => {
    const msg = _formatWitnessMessage({
        actor: 'Hamilton', type: 'nomination',
        details: { office: 'president', election_id: 1 }
    }, 0);
    assert.match(msg, /^\[ELECTION\]/);
    assert.match(msg, /Hamilton/);
    assert.match(msg, /!castVote\(1, "Hamilton"\)/);
});

test('law_proposed renders [LAW] with the actual proposed text', () => {
    const msg = _formatWitnessMessage({
        actor: 'Paine', type: 'law_proposed',
        details: { law_text: 'No raiding inside the contested zone.', law_id: 7 }
    }, 0);
    assert.match(msg, /^\[LAW\]/);
    assert.match(msg, /Paine/);
    assert.match(msg, /No raiding inside the contested zone/);
});

test('a physical (WITNESS_TYPES) action still renders the [SAW] marker (regression)', () => {
    const msg = _formatWitnessMessage({
        actor: 'Wolf', type: 'attack_player',
        details: { target: 'Madison' },
        location: { x: 10, y: 64, z: -3 }
    }, 20);   // 20 blocks → [SAW]
    assert.match(msg, /^\[SAW\]/);
    assert.match(msg, /Wolf attacked Madison/);
});

test('a close physical action renders the [SAW UP CLOSE] marker (regression)', () => {
    const msg = _formatWitnessMessage({
        actor: 'Fox', type: 'attack_player',
        details: { target: 'Paine' },
        location: { x: 0, y: 64, z: 0 }
    }, 4);    // 4 < NEAR_DISTANCE (8) → [SAW UP CLOSE]
    assert.match(msg, /^\[SAW UP CLOSE\]/);
});

test('missing election_id renders without crashing (uses a "?" placeholder)', () => {
    const msg = _formatWitnessMessage({
        actor: 'Madison', type: 'election_called',
        details: { office: 'judge' }   // no election_id
    }, 0);
    assert.match(msg, /Madison/);
    assert.match(msg, /judge/);
    assert.doesNotMatch(msg, /undefined/, 'must not leak the string "undefined" into the prompt');
});
