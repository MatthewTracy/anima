/**
 * Tests for core/souls/pantheon.js — cross-scenario shared mythology.
 *
 * NOTE: pantheon.js writes to ./pantheon.md (hardcoded path). To avoid
 * polluting the seed, these tests mutate that file but restore it.
 *
 * Run: node --test tests/core_pantheon.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { generateEpitaph, appendEpitaph, readEpitaphs, asPromptText } from '../core/souls/pantheon.js';

const PANTHEON_PATH = './pantheon.md';
let savedPantheon = null;

function backup() {
    if (existsSync(PANTHEON_PATH)) {
        savedPantheon = readFileSync(PANTHEON_PATH, 'utf8');
    } else {
        savedPantheon = null;
    }
}
function restore() {
    if (savedPantheon !== null) writeFileSync(PANTHEON_PATH, savedPantheon);
    savedPantheon = null;
}

beforeEach(backup);
afterEach(restore);

const SAMPLE_SOUL = `# TestPersona

## Who I am
A test character.

## What I have learned
- Some lessons must be lived, not taught.

## My scars
- I trusted Hamilton.

## My motto
"I outlast."
`;

test('generateEpitaph extracts motto + learning + scar', () => {
    const e = generateEpitaph('TestPersona', SAMPLE_SOUL, { cause: 'old age' }, 'test-scenario');
    assert.match(e, /TestPersona/);
    assert.match(e, /I outlast/);
    assert.match(e, /Some lessons must be lived/);
    assert.match(e, /trusted Hamilton/);
    assert.match(e, /old age/);
});

test('generateEpitaph survives missing sections gracefully', () => {
    const minimalSoul = '# Minimal\n\n## My motto\n"only motto."\n';
    const e = generateEpitaph('Minimal', minimalSoul, { cause: 'unknown' }, 'test');
    assert.match(e, /only motto/);
    // Should not crash on missing learning/scar
});

test('appendEpitaph + readEpitaphs round-trip', () => {
    const before = readEpitaphs().length;
    const ok = appendEpitaph('TestEpitaph123', SAMPLE_SOUL, { cause: 'test' }, 'test');
    assert.equal(ok, true);
    const after = readEpitaphs().length;
    assert.equal(after, before + 1);
});

// v0.36 regression: concurrent appends should all land (atomic appendFileSync)
test('appendEpitaph: 6 simultaneous appends all land (no race loss)', () => {
    const before = readEpitaphs().length;
    const names = ['Mass1', 'Mass2', 'Mass3', 'Mass4', 'Mass5', 'Mass6'];
    // Fire all six synchronously back-to-back — emulates the worst case of
    // an Outpost mass-depressurization where 6 Soul.lock() calls fire in
    // close succession. Pre-v0.36 this lost entries due to read-then-write.
    for (const n of names) appendEpitaph(n, SAMPLE_SOUL, { cause: 'test mass event' }, 'test');
    const after = readEpitaphs().length;
    assert.equal(after, before + 6, `expected ${before + 6} entries after 6 appends, got ${after}`);
});

test('v1.1.18: pantheon header is written exactly once across many appends', () => {
    // Same TOCTOU-safety guarantee as the v1.1.4 fix in consolidation.
    // Pre-fix, two simultaneous appendEpitaph calls into a missing
    // pantheon.md could both writeFileSync the header, the second
    // clobbering the first. After v1.1.18, the 'wx' flag makes the
    // header create atomic; subsequent calls fall through to plain append.
    // We delete the pantheon, append several epitaphs serially and
    // back-to-back (which is the realistic worst case in a single-
    // process scenario), and assert the file has exactly ONE header.
    if (existsSync(PANTHEON_PATH)) unlinkSync(PANTHEON_PATH);
    for (const n of ['HeaderA', 'HeaderB', 'HeaderC']) {
        appendEpitaph(n, SAMPLE_SOUL, { cause: 'header race test' }, 'test');
    }
    const text = readFileSync(PANTHEON_PATH, 'utf8');
    const headerCount = (text.match(/^# The Pantheon\b/gm) || []).length;
    assert.equal(headerCount, 1, `expected exactly one Pantheon header, got ${headerCount}`);
});

test('asPromptText returns 3 random epitaphs (or empty message)', () => {
    appendEpitaph('TestA', SAMPLE_SOUL, { cause: 'a' }, 'test');
    appendEpitaph('TestB', SAMPLE_SOUL, { cause: 'b' }, 'test');
    const text = asPromptText(2);
    assert.match(text, /THE PANTHEON/);
    // Should reference at least one of the test entries
    assert.ok(text.includes('TestA') || text.includes('TestB'));
});
