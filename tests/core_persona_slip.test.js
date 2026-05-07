/**
 * Tests for v0.79 — persona masks slip under acute allostatic load.
 *
 * Real psych: Goffman (1959) "The Presentation of Self in Everyday Life"
 * + clinical literature on the cognitive cost of social-mask
 * maintenance under stress. When the body is overloaded, the
 * performance the agent is putting on takes effort it can't spare.
 *
 * Composes v0.26 (persona masks) with v0.56 (allostatic load).
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'fs';
import { Persona } from '../core/personas/persona.js';
import { recordStress, _clearStress } from '../core/cognition/allostatic_load.js';

const NAME = '_TestPersonaSlip';

function clean() {
    if (existsSync(`./bots/${NAME}`)) rmSync(`./bots/${NAME}`, { recursive: true, force: true });
}
beforeEach(clean);
afterEach(clean);

test('baseline load: no slip note in mask prompt', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Brother Gareth', bio: 'wandering monk', motive: 'hide my past' });
    // No stress recorded — load is 0
    const text = p.asPromptText();
    assert.match(text, /YOUR ACTIVE MASK/);
    assert.ok(!/SLIPPING|HEAVIER/.test(text), `expected no slip note: ${text}`);
});

test('allostatic load: heavier-mask note appears', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Brother Gareth', bio: 'wandering monk' });
    // Drive load to ~0.55-0.65 (allostatic but not overloaded)
    for (let i = 0; i < 9; i++) recordStress(NAME, 1.0);
    const text = p.asPromptText();
    assert.match(text, /MASK IS HEAVIER/);
    assert.ok(!/SLIPPING/.test(text), 'should NOT show slipping yet at allostatic level');
});

test('overloaded load: mask slipping note replaces it', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Brother Gareth', bio: 'wandering monk' });
    for (let i = 0; i < 25; i++) recordStress(NAME, 1.0);
    const text = p.asPromptText();
    assert.match(text, /MASK IS SLIPPING/);
    assert.match(text, /real _TestPersonaSlip keeps surfacing/);
});

test('no mask: no slip note at any stress level (vacuous)', () => {
    // Even if stress is overloaded, agents without an active persona
    // get an empty string — there is nothing to slip.
    for (let i = 0; i < 25; i++) recordStress(NAME, 1.0);
    const p = new Persona(NAME);
    assert.equal(p.asPromptText(), '');
});

test('slipping note reads as actor-name reveal cue, not just "slipping"', () => {
    const p = new Persona(NAME);
    p.adopt({ alias: 'Saint Albion', bio: 'fugitive' });
    for (let i = 0; i < 25; i++) recordStress(NAME, 1.0);
    const text = p.asPromptText();
    // Should name BOTH the alias and the real name in the slipping note,
    // so the LLM sees what's at stake of being revealed.
    assert.match(text, /Saint Albion/);
    assert.match(text, /_TestPersonaSlip/);
});
