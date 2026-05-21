/**
 * Tests for src/utils/text.js helpers.
 *
 * v1.1.63: normalizeContent — the shared null/empty-content guard the
 * nine non-openrouter/deepseek model wrappers route through. Providers
 * intermittently return null content; pre-fix that null propagated to
 * prompter.js which threw "Generated response is not a string" and
 * burned the agent's turn.
 *
 * v1.1.69: strictFormat / wordOverlapScore / toSinglePrompt /
 * stringifyTurns — the rest of text.js. strictFormat's role-alternation
 * is the subtlest logic in the file and shapes every prompt sent to the
 * provider; it was entirely untested.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeContent, strictFormat, wordOverlapScore,
    toSinglePrompt, stringifyTurns,
} from '../src/utils/text.js';

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

// ── strictFormat (v1.1.69) ───────────────────────────────────────────

test('strictFormat: consecutive user messages are combined with newline', () => {
    const out = strictFormat([
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].role, 'user');
    assert.equal(out[0].content, 'first\nsecond');
});

test('strictFormat: consecutive assistant messages get a filler user between them', () => {
    const out = strictFormat([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'a1' },
        { role: 'assistant', content: 'a2' },
    ]);
    // user, a1, filler-user, a2
    assert.deepEqual(out.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
    assert.equal(out[2].content, '_');
});

test('strictFormat: system messages become user messages prefixed SYSTEM:', () => {
    const out = strictFormat([{ role: 'system', content: 'be brief' }]);
    assert.equal(out[0].role, 'user');
    assert.equal(out[0].content, 'SYSTEM: be brief');
});

test('strictFormat: output always starts with a user message', () => {
    const out = strictFormat([{ role: 'assistant', content: 'leading model turn' }]);
    assert.equal(out[0].role, 'user');
    assert.equal(out[0].content, '_');   // filler unshifted to the front
});

test('strictFormat: empty input yields a single filler user message', () => {
    const out = strictFormat([]);
    assert.deepEqual(out, [{ role: 'user', content: '_' }]);
});

test('strictFormat: string content is trimmed', () => {
    const out = strictFormat([{ role: 'user', content: '  padded  ' }]);
    assert.equal(out[0].content, 'padded');
});

// ── wordOverlapScore (v1.1.69) ───────────────────────────────────────

test('wordOverlapScore: identical text scores 1', () => {
    assert.equal(wordOverlapScore('hello world', 'hello world'), 1);
});

test('wordOverlapScore: fully disjoint text scores 0', () => {
    assert.equal(wordOverlapScore('alpha beta', 'gamma delta'), 0);
});

test('wordOverlapScore: partial overlap is the Jaccard ratio', () => {
    // {hello,world} vs {hello,there}: intersection 1, union 3 → 1/3
    assert.equal(wordOverlapScore('hello world', 'hello there'), 1 / 3);
});

test('wordOverlapScore: punctuation and case are ignored', () => {
    assert.equal(wordOverlapScore('Hello, World!', 'hello world'), 1);
});

// ── toSinglePrompt (v1.1.69) ─────────────────────────────────────────

test('toSinglePrompt: joins turns with role markers and stop sequence', () => {
    const out = toSinglePrompt(
        [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'bye' }],
        null, '***', 'assistant'
    );
    assert.equal(out, 'user: hi***assistant: bye***');
});

test('toSinglePrompt: appends a trailing model turn when last turn is not the model', () => {
    const out = toSinglePrompt([{ role: 'user', content: 'hi' }], null, '***', 'assistant');
    assert.equal(out, 'user: hi***assistant: ');
});

test('toSinglePrompt: prepends the system message when given', () => {
    const out = toSinglePrompt([{ role: 'user', content: 'hi' }], 'SYS', '***', 'assistant');
    assert.ok(out.startsWith('SYS***'));
});

// ── stringifyTurns (v1.1.69) ─────────────────────────────────────────

test('stringifyTurns: labels assistant / system / user lines', () => {
    const out = stringifyTurns([
        { role: 'user', content: 'u' },
        { role: 'assistant', content: 'a' },
        { role: 'system', content: 's' },
    ]);
    assert.match(out, /User input: u/);
    assert.match(out, /Your output:\na/);
    assert.match(out, /System output: s/);
});

test('stringifyTurns: empty turns yields empty string', () => {
    assert.equal(stringifyTurns([]), '');
});
