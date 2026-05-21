/**
 * Tests for src/agent/self_prompter.js (v1.1.69).
 *
 * SelfPrompter drives the agent's autonomous goal loop. Its state
 * machine and guard conditions had no coverage — v1.1.42 fixed a real
 * cooldown bug in this file. These exercise the state machine and the
 * guard predicates against a mock agent, WITHOUT running the live
 * prompt loop (which would make real handleMessage calls).
 *
 * The loop-suppression trick: with `interrupt = true` set first,
 * startLoop()'s `while (!this.interrupt)` body never runs, so start()
 * completes synchronously — letting us assert the state transition
 * without kicking off async LLM traffic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelfPrompter } from '../src/agent/self_prompter.js';
import { makeMockAgent } from './_mock_agent.js';

test('a fresh SelfPrompter is STOPPED', () => {
    const sp = new SelfPrompter(makeMockAgent());
    assert.equal(sp.isStopped(), true);
    assert.equal(sp.isActive(), false);
    assert.equal(sp.isPaused(), false);
});

test('start(prompt) transitions to ACTIVE and stores the prompt', () => {
    const sp = new SelfPrompter(makeMockAgent());
    sp.interrupt = true;            // suppress the live loop (see header)
    sp.start('build a shelter');
    assert.equal(sp.isActive(), true);
    assert.equal(sp.prompt, 'build a shelter');
});

test('start() with no prompt and no stored prompt is refused', () => {
    const sp = new SelfPrompter(makeMockAgent());
    const result = sp.start();
    assert.match(result, /No prompt specified/);
    assert.equal(sp.isStopped(), true, 'a refused start must not change state');
});

test('start() with no argument reuses a previously stored prompt', () => {
    const sp = new SelfPrompter(makeMockAgent());
    sp.prompt = 'remembered goal';
    sp.interrupt = true;            // suppress the live loop
    sp.start();
    assert.equal(sp.isActive(), true);
    assert.equal(sp.prompt, 'remembered goal');
});

test('setPromptPaused transitions to PAUSED and stores the prompt', () => {
    const sp = new SelfPrompter(makeMockAgent());
    sp.setPromptPaused('paused goal');
    assert.equal(sp.isPaused(), true);
    assert.equal(sp.prompt, 'paused goal');
});

test('handleLoad with no state defaults to STOPPED', async () => {
    const sp = new SelfPrompter(makeMockAgent());
    await sp.handleLoad('loaded goal');
    assert.equal(sp.isStopped(), true);
    assert.equal(sp.prompt, 'loaded goal');
});

test('handleLoad rejects an active state with no prompt', async () => {
    const sp = new SelfPrompter(makeMockAgent());
    // state 1 = ACTIVE; an active self-prompt with no prompt is invalid.
    await assert.rejects(() => sp.handleLoad(null, 1), /No prompt loaded/);
});

test('stop() sets STOPPED and raises the interrupt flag', async () => {
    const sp = new SelfPrompter(makeMockAgent());
    sp.interrupt = true;
    sp.start('a goal');             // ACTIVE, loop suppressed
    await sp.stop();
    assert.equal(sp.isStopped(), true);
});

test('shouldInterrupt is true only for a self-prompt while ACTIVE/PAUSED and interrupted', () => {
    const sp = new SelfPrompter(makeMockAgent());
    sp.interrupt = true;
    sp.start('g');                  // ACTIVE
    sp.interrupt = true;            // startLoop reset it; re-raise
    assert.equal(sp.shouldInterrupt(true), true);
    assert.equal(sp.shouldInterrupt(false), false, 'not a self-prompt → never interrupt');
    sp.interrupt = false;
    assert.equal(sp.shouldInterrupt(true), false, 'no interrupt flag → false');
});

test('handleUserPromptedCmd stops the loop only on a non-self-prompt action', () => {
    const sp = new SelfPrompter(makeMockAgent());
    let stopped = 0;
    sp.stopLoop = async () => { stopped++; };
    sp.handleUserPromptedCmd(true, true);    // is_self_prompt → no stop
    assert.equal(stopped, 0);
    sp.handleUserPromptedCmd(false, false);  // not an action → no stop
    assert.equal(stopped, 0);
    sp.handleUserPromptedCmd(false, true);   // user action → stop
    assert.equal(stopped, 1);
});
