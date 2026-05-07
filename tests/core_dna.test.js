/**
 * Tests for core/dna/soul_dna.js — value-vector extraction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDNA, similarity } from '../core/dna/soul_dna.js';

const LOYAL_SOUL = `# Test
## Who I am
I am loyal to my faction. My tribe is everything. I serve them, I defend them, I die for them.
## My motto
"My duty to my comrades is my whole life."
`;

const SOLO_SOUL = `# Test
## Who I am
I walk alone. I owe no one anything. I am free, independent, unbound by oath or pact.
## My motto
"I leave when leaving serves me."
`;

test('extractDNA returns vector with expected axes', () => {
    const dna = extractDNA(LOYAL_SOUL);
    assert.ok(dna);
    assert.ok(typeof dna.loyalty === 'number');
    assert.ok(typeof dna.doubt === 'number');
    assert.ok(typeof dna.action === 'number');
});

test('extractDNA returns null for empty input', () => {
    assert.equal(extractDNA(''), null);
    assert.equal(extractDNA(null), null);
});

test('LOYAL soul scores positive on loyalty axis', () => {
    const dna = extractDNA(LOYAL_SOUL);
    assert.ok(dna.loyalty > 0, `expected positive loyalty, got ${dna.loyalty}`);
});

test('SOLO soul scores negative on loyalty axis', () => {
    const dna = extractDNA(SOLO_SOUL);
    assert.ok(dna.loyalty < 0, `expected negative loyalty, got ${dna.loyalty}`);
});

test('similarity of soul with itself is 1', () => {
    const dna = extractDNA(LOYAL_SOUL);
    assert.equal(similarity(dna, dna), 1.0);
});

test('similarity of loyal vs solo is negative', () => {
    const a = extractDNA(LOYAL_SOUL);
    const b = extractDNA(SOLO_SOUL);
    assert.ok(similarity(a, b) < 0, `expected negative cross-similarity`);
});
