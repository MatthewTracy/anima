/**
 * Tests for core/personas/persona.js — active impersonation.
 *
 * Run: node --test tests/core_persona.test.js
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Persona, resolveDisplayName } from '../core/personas/persona.js';

const NAME = '_TestPersona';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}

beforeEach(clean);
afterEach(clean);

test('Persona.adopt sets active mask', () => {
    const p = new Persona(NAME);
    assert.equal(p.isWearingMask(), false);
    p.adopt({ alias: 'Brother Bartholomew', bio: 'wandering monk' });
    assert.equal(p.isWearingMask(), true);
    const r = p.read();
    assert.equal(r.alias, 'Brother Bartholomew');
});

test('resolveDisplayName returns alias when mask active', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Disguised' });
    assert.equal(resolveDisplayName(NAME), 'Disguised');
});

test('resolveDisplayName returns real name when no mask', () => {
    assert.equal(resolveDisplayName('NeverWearsAMask'), 'NeverWearsAMask');
});

test('Persona.expose marks history with exposedBy + clears active', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Spy' });
    p.expose('Detective', 'caught reading code book');
    assert.equal(p.isWearingMask(), false);
    const hist = p.history();
    assert.equal(hist.length, 1);
    assert.equal(hist[0].exposed, true);
    assert.equal(hist[0].exposedBy, 'Detective');
});

test('Persona.drop is voluntary, not exposed', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Mendicant' });
    p.drop();
    assert.equal(p.isWearingMask(), false);
    const hist = p.history();
    assert.equal(hist.length, 1);
    assert.equal(hist[0].exposed, false);
});

test('Persona supports multiple masks across rotations', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'First' });
    p.expose('A', 'caught');
    p.adopt({ alias: 'Second' });
    p.drop();
    const hist = p.history();
    assert.equal(hist.length, 2);
    assert.equal(hist[0].alias, 'First');
    assert.equal(hist[1].alias, 'Second');
});
