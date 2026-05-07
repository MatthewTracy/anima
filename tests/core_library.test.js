/**
 * Tests for core/library/library.js — text-search retrieval.
 *
 * Run: node --test tests/core_library.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, asPromptText, stats } from '../core/library/library.js';

test('search returns array (may be empty if no docs)', () => {
    const results = search('madison');
    assert.ok(Array.isArray(results));
});

test('search with empty query returns empty array', () => {
    assert.deepEqual(search(''), []);
});

test('asPromptText returns LIBRARY block even with empty results', () => {
    const text = asPromptText('this_string_will_not_match_anything_xyzzy_321');
    assert.match(text, /THE LIBRARY/);
});

test('stats returns object with expected fields', () => {
    const s = stats();
    assert.ok(typeof s.totalDocs === 'number');
    assert.ok(typeof s.totalChars === 'number');
    assert.ok(typeof s.byKind === 'object');
});
