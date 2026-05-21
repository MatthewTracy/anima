/**
 * Tests for src/utils/text.js helpers.
 *
 * v1.1.63: normalizeContent — the shared null/empty-content guard the
 * nine non-openrouter/deepseek model wrappers route through. Providers
 * intermittently return null content; pre-fix that null propagated to
 * prompter.js which threw "Generated response is not a string" and
 * burned the agent's turn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent } from '../src/utils/text.js';

const SOFT_FAIL = 'My mind went blank, try again.';

test('normalizeContent: null → soft-fail string', () => {
    assert.equal(normalizeContent(null, 'Test'), SOFT_FAIL);
});

test('normalizeContent: undefined → soft-fail string', () => {
    assert.equal(normalizeContent(undefined, 'Test'), SOFT_FAIL);
});

test('normalizeContent: empty string → soft-fail string', () => {
    assert.equal(normalizeContent('', 'Test'), SOFT_FAIL);
});

test('normalizeContent: whitespace-only string → soft-fail string', () => {
    assert.equal(normalizeContent('   \n\t  ', 'Test'), SOFT_FAIL);
});

test('normalizeContent: real content → passed through unchanged', () => {
    const real = '!goToPlayer("Hamilton", 3)';
    assert.equal(normalizeContent(real, 'Test'), real);
});

test('normalizeContent: content with leading/trailing space → preserved (not trimmed)', () => {
    // Non-empty content is returned verbatim — only fully-empty is replaced.
    const padded = '  hello world  ';
    assert.equal(normalizeContent(padded, 'Test'), padded);
});

test('normalizeContent: modelLabel is optional', () => {
    assert.equal(normalizeContent('ok'), 'ok');
    assert.equal(normalizeContent(null), SOFT_FAIL);
});

test('normalizeContent: the soft-fail return is always a string', () => {
    for (const input of [null, undefined, '', '   ']) {
        assert.equal(typeof normalizeContent(input, 'X'), 'string');
    }
});
