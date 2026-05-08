/**
 * Tests for v1.1.58 — seedBurdensFromBank.
 *
 * Pre-fix: the four bank files at core/burdens/banks/{cloister,crew,
 * outpost,forum}.json shipped as data but no scenario runner loaded
 * them. Only Cell had burden assignment wired up. The new
 * seedBurdensFromBank helper closes that gap; the runners now call it.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Burden, seedBurdensFromBank } from '../core/burdens/burden.js';

const ROSTER = ['_TestSeedA', '_TestSeedB', '_TestSeedC', '_TestSeedD', '_TestSeedE'];

function clean() {
    for (const n of ROSTER) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}

beforeEach(clean);
afterEach(clean);

test('seedBurdensFromBank loads cloister bank and assigns probabilistically', () => {
    const result = seedBurdensFromBank('cloister', ROSTER, { rate: 1.0 });
    assert.equal(result.total, ROSTER.length);
    assert.equal(result.assigned, ROSTER.length, 'with rate=1.0, every agent gets a burden');
    assert.equal(result.skipped, 0);
    // Every agent should now carry a burden
    for (const n of ROSTER) {
        const b = new Burden(n).read();
        assert.ok(b, `${n} should have a burden`);
        assert.ok(typeof b.text === 'string' && b.text.length > 0,
            `${n}'s burden must have non-empty text`);
    }
});

test('seedBurdensFromBank skips already-burdened agents (idempotent)', () => {
    seedBurdensFromBank('cloister', ROSTER, { rate: 1.0 });
    // Re-seed: nobody should be re-assigned
    const result = seedBurdensFromBank('cloister', ROSTER, { rate: 1.0 });
    assert.equal(result.assigned, 0, 'already-burdened agents must be skipped');
    assert.equal(result.skipped, ROSTER.length);
});

test('seedBurdensFromBank with rate=0 assigns nothing', () => {
    const result = seedBurdensFromBank('cloister', ROSTER, { rate: 0 });
    assert.equal(result.assigned, 0);
    for (const n of ROSTER) {
        assert.equal(new Burden(n).read(), null, `${n} should have no burden`);
    }
});

test('all four named banks load successfully', () => {
    // Verify each scenario's data file is real and parseable.
    for (const scenarioName of ['cloister', 'crew', 'outpost', 'forum']) {
        const result = seedBurdensFromBank(scenarioName, [`_TestSeed_${scenarioName}_1`], { rate: 1.0 });
        assert.equal(result.total, 1, `${scenarioName} bank must load and process`);
        assert.equal(result.assigned, 1, `${scenarioName} bank must yield a burden at rate=1.0`);
        // Cleanup
        rmSync(`./bots/_TestSeed_${scenarioName}_1`, { recursive: true, force: true });
    }
});

test('missing bank returns zero counts without throwing', () => {
    const result = seedBurdensFromBank('does_not_exist_bank_xyz', ROSTER, { rate: 1.0 });
    assert.equal(result.total, 0);
    assert.equal(result.assigned, 0);
});

test('explicit bankPath override works', () => {
    const result = seedBurdensFromBank('arbitrary_name', ROSTER, {
        rate: 1.0,
        bankPath: './core/burdens/banks/cloister.json'
    });
    assert.equal(result.assigned, ROSTER.length,
        'explicit bankPath should override the default scenarioName-based path');
});
