/**
 * Tests for v0.93 — optimism/pessimism bias on belief updates.
 *
 * Real cognitive psych: Tali Sharot's work (Sharot 2011) on asymmetric
 * updating from positive vs negative prediction errors. Optimists weight
 * good news more; pessimists weight bad news more. Uses soul DNA's
 * trust axis as the optimism / pessimism dimension.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { optimismBias, explainOptimism, _CONSTANTS } from '../core/cognition/optimism.js';

const NAMES = ['_TestOptA', '_TestOptB', '_TestOptC'];

function clean() {
    for (const n of NAMES) {
        if (existsSync(`./bots/${n}`)) rmSync(`./bots/${n}`, { recursive: true, force: true });
    }
}
beforeEach(clean);
afterEach(clean);

function optimistSoul(name) {
    const dir = join('./bots', name);
    mkdirSync(dir, { recursive: true });
    // Heavy "trust" pole — open, faith, depend, rely
    writeFileSync(join(dir, 'soul.md'),
        `# ${name}\n\n` +
        '- I have learned to trust. I rely on others. I depend on them. I have faith.\n' +
        '- I am open. I am honest. I am transparent. I believe.\n');
}

function pessimistSoul(name) {
    const dir = join('./bots', name);
    mkdirSync(dir, { recursive: true });
    // Heavy "suspicion" pole — wary, paranoid, careful, lie, deceive
    writeFileSync(join(dir, 'soul.md'),
        `# ${name}\n\n` +
        '- I have learned to be wary. I do not trust easily. I am careful. I am paranoid.\n' +
        '- I expect lies. I expect deceit. I guard myself. Suspicion serves me.\n');
}

// ── Pure-math tests ─────────────────────────────────────────────

test('no DNA → multiplier is 1.0', () => {
    assert.equal(optimismBias('_TestOptA', +0.1), 1.0);
});

test('zero delta → 1.0 regardless', () => {
    optimistSoul('_TestOptA');
    assert.equal(optimismBias('_TestOptA', 0), 1.0);
});

test('optimist on positive delta amplifies', () => {
    optimistSoul('_TestOptA');
    const m = optimismBias('_TestOptA', +0.1);
    assert.ok(m > 1.0, `expected > 1.0, got ${m}`);
});

test('optimist on negative delta dampens', () => {
    optimistSoul('_TestOptA');
    const m = optimismBias('_TestOptA', -0.1);
    assert.ok(m < 1.0, `expected < 1.0, got ${m}`);
});

test('pessimist on positive delta dampens (discount good news)', () => {
    pessimistSoul('_TestOptA');
    const m = optimismBias('_TestOptA', +0.1);
    assert.ok(m < 1.0, `expected < 1.0, got ${m}`);
});

test('pessimist on negative delta amplifies (suspicion confirmed)', () => {
    pessimistSoul('_TestOptA');
    const m = optimismBias('_TestOptA', -0.1);
    assert.ok(m > 1.0, `expected > 1.0, got ${m}`);
});

test('balanced trust axis → 1.0', () => {
    // No trust-axis keywords either way
    const dir = join('./bots', '_TestOptA');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'),
        `# _TestOptA\n\n- I am quiet. I keep to myself. I observe.\n`);
    const m = optimismBias('_TestOptA', +0.1);
    assert.equal(m, 1.0);
});

test('explainOptimism names the role and direction', () => {
    optimistSoul('_TestOptA');
    const r = explainOptimism('_TestOptA', +0.1);
    assert.match(r.reason, /optimist.*positive/);

    pessimistSoul('_TestOptB');
    const r2 = explainOptimism('_TestOptB', -0.1);
    assert.match(r2.reason, /pessimist.*negative/);
});

test('exposed thresholds are sane', () => {
    assert.ok(_CONSTANTS.OPTIMISM_THRESHOLD > 0 && _CONSTANTS.OPTIMISM_THRESHOLD < 1);
    assert.ok(_CONSTANTS.ASYMMETRY_BONUS > 0);
    assert.ok(_CONSTANTS.ASYMMETRY_DAMP > 0);
});
