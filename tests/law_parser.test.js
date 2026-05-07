/**
 * Tests for src/governance/law_parser.js — constitution-as-code rule extraction.
 *
 * Locked-in behaviors:
 *   - Tax rule disambiguates % markers + low-integer cases correctly
 *   - Time-based rules clamp to bounded ranges
 *   - Notes fire only on their explicit phrasing
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLawAsCode, formatMutationSummary } from '../src/governance/law_parser.js';

const params = {
    tax_rate: 0.2,
    nomination_period_ms: 30000,
    voting_period_ms: 45000,
    law_voting_period_ms: 60000,
    president_term_ms: 600000
};

test('tax rule: percent with explicit %', () => {
    const r = parseLawAsCode('Set the tax rate to 30%.', params);
    assert.equal(r.mutations.length, 1);
    assert.equal(r.mutations[0].param, 'tax_rate');
    assert.equal(r.mutations[0].newValue, 0.3);
});

test('tax rule: number > 1 is treated as percent', () => {
    const r = parseLawAsCode('Tax of 25.', params);
    assert.equal(r.mutations[0].newValue, 0.25);
});

test('tax rule: decimal < 1 is treated as decimal rate', () => {
    const r = parseLawAsCode('Tax rate 0.4', params);
    assert.equal(r.mutations[0].newValue, 0.4);
});

test('v1.1.51: tax rule "tax of 1%" → 1%, not 100% (capped to 90%)', () => {
    // Pre-fix this returned 0.9 (90% tax) because pct=1 fell through to
    // the decimal branch which capped 1.0 at 0.9. Most natural reading
    // of "tax of 1%" is 1%; the explicit % marker now resolves it.
    const r = parseLawAsCode('Tax of 1%.', params);
    assert.equal(r.mutations[0].newValue, 0.01,
        `expected 1% tax, got ${r.mutations[0].newValue}`);
});

test('v1.1.51: tax rule "tax of 1" → 1%, not 100%', () => {
    // Same boundary case without the % marker. pct >= 1 means percent
    // interpretation, since a tax rate decimal of 1.0 is meaningless
    // (already capped at 0.9).
    const r = parseLawAsCode('Tax of 1', params);
    assert.equal(r.mutations[0].newValue, 0.01,
        `expected 1% tax, got ${r.mutations[0].newValue}`);
});

test('tax rule: caps at 90%', () => {
    const r = parseLawAsCode('Tax rate 250%', params);
    assert.equal(r.mutations[0].newValue, 0.9);
});

test('nomination period: seconds', () => {
    const r = parseLawAsCode('Nomination period of 90 seconds.', params);
    assert.equal(r.mutations[0].param, 'nomination_period_ms');
    assert.equal(r.mutations[0].newValue, 90000);
});

test('nomination period: clamps to bounds', () => {
    const r = parseLawAsCode('Nomination period of 1 second.', params);
    assert.equal(r.mutations[0].newValue, 10000);  // floor
});

test('president term: minutes', () => {
    const r = parseLawAsCode('President term: 8 minutes', params);
    assert.equal(r.mutations[0].param, 'president_term_ms');
    assert.equal(r.mutations[0].newValue, 480000);
});

test('notes fire on explicit phrasing', () => {
    const r = parseLawAsCode('No taxation, no representation.', params);
    assert.ok(r.notes.includes('NO_TAX'));
});

test('no mutations when text is empty / non-string', () => {
    assert.deepEqual(parseLawAsCode('', params), { mutations: [], notes: [] });
    assert.deepEqual(parseLawAsCode(null, params), { mutations: [], notes: [] });
});

test('formatMutationSummary renders nothing when both arrays empty', () => {
    assert.equal(formatMutationSummary([], []), '');
});
