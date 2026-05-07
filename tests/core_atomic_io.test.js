/**
 * Tests for core/runtime/atomic_io.js — write-to-tmp + rename helper.
 *
 * Confirms:
 *   - normal writes land at the destination
 *   - parent directory auto-created
 *   - on rename failure, no half-written file at the destination
 *   - stray .tmp from a prior crashed write is overwritten by next save
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync } from '../core/runtime/atomic_io.js';

const DIR = './bots/_TestAtomicIO';

function clean() {
    if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

test('normal write creates the file with the requested content', () => {
    const path = join(DIR, 'state.json');
    atomicWriteFileSync(path, '{"x":1}');
    assert.equal(readFileSync(path, 'utf8'), '{"x":1}');
});

test('parent directory is created if missing', () => {
    const path = join(DIR, 'nested', 'deeper', 'state.json');
    assert.ok(!existsSync(path));
    atomicWriteFileSync(path, 'hello');
    assert.equal(readFileSync(path, 'utf8'), 'hello');
});

test('overwriting an existing file is atomic-safe', () => {
    const path = join(DIR, 'state.json');
    atomicWriteFileSync(path, 'first');
    atomicWriteFileSync(path, 'second');
    assert.equal(readFileSync(path, 'utf8'), 'second');
    // No stray .tmp left behind on success
    assert.ok(!existsSync(path + '.tmp'));
});

test('a stray .tmp from a prior crashed write does not pollute reads', () => {
    const path = join(DIR, 'state.json');
    mkdirSync(DIR, { recursive: true });
    // Plant a corrupted .tmp simulating a prior crash
    writeFileSync(path, 'real-content');
    writeFileSync(path + '.tmp', '{partial');

    // Real file should still read fine
    assert.equal(readFileSync(path, 'utf8'), 'real-content');

    // Next atomic write should succeed (overwriting the stray tmp)
    atomicWriteFileSync(path, 'new-content');
    assert.equal(readFileSync(path, 'utf8'), 'new-content');
});

test('content can be a Buffer (not just string)', () => {
    const path = join(DIR, 'binary.bin');
    const buf = Buffer.from([0x00, 0xff, 0x42]);
    atomicWriteFileSync(path, buf);
    const back = readFileSync(path);
    assert.equal(back[0], 0x00);
    assert.equal(back[1], 0xff);
    assert.equal(back[2], 0x42);
});

test('v1.1.22: many writers to the same path do NOT race on the tmp file', () => {
    // Pre-fix bug: every call shared the same tmp name (path + ".tmp"),
    // so two writers to the same path could clobber each other's tmp
    // and the second renameSync would fail ENOENT. Now each call gets
    // a unique <path>.tmp-<pid>-<random> suffix.
    const path = join(DIR, 'shared.json');
    let failures = 0;
    for (let i = 0; i < 20; i++) {
        try {
            atomicWriteFileSync(path, JSON.stringify({ writer: i }));
        } catch {
            failures++;
        }
    }
    assert.equal(failures, 0, 'no writes should fail');
    // Final state must be valid JSON (not a half-written tmp).
    const final = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(typeof final.writer === 'number');
    // No stray tmp files left behind.
    const stragglers = readdirSync(DIR).filter(f => f.startsWith('shared.json.tmp'));
    assert.deepEqual(stragglers, [], `stale tmp files: ${stragglers.join(', ')}`);
});
