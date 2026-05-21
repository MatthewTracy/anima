/**
 * Tests for src/agent/action_manager.js (v1.1.69).
 *
 * ActionManager runs the agent's action queue and carries two
 * loop-protection mechanisms — fast-loop detection and goal-thrashing
 * detection — plus the error-reporting path that v1.1.43 fixed. None
 * of it was tested. These exercise the real class against a mock agent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionManager } from '../src/agent/action_manager.js';
import { makeMockAgent, spy } from './_mock_agent.js';

const noop = async () => {};
const opts = { timeout: 0 };   // no timeout timer in tests

test('runAction returns the standard status-report shape on success', async () => {
    const am = new ActionManager(makeMockAgent());
    const res = await am.runAction('test:label', noop, opts);
    assert.equal(res.success, true);
    assert.equal(typeof res.message, 'string');
    assert.equal(res.interrupted, false);
    assert.equal(res.timedout, false);
});

test('a successful action leaves executing=false and clears the label', async () => {
    const am = new ActionManager(makeMockAgent());
    await am.runAction('test:label', noop, opts);
    assert.equal(am.executing, false);
    assert.equal(am.currentActionLabel, '');
});

test('fast-loop: rapid back-to-back actions accumulate recent_action_counter', async () => {
    const am = new ActionManager(makeMockAgent());
    for (let i = 0; i < 4; i++) await am.runAction('same', noop, opts);
    // call 1 sets last_action_time; calls 2-4 land <20ms apart → counter climbs
    assert.ok(am.recent_action_counter >= 2,
        `expected counter to climb under rapid calls, got ${am.recent_action_counter}`);
});

test('fast-loop: a slow action resets recent_action_counter', async () => {
    const am = new ActionManager(makeMockAgent());
    await am.runAction('a', noop, opts);
    await am.runAction('a', noop, opts);   // rapid → counter > 0
    assert.ok(am.recent_action_counter > 0);
    await new Promise(r => setTimeout(r, 30));   // >20ms gap
    await am.runAction('a', noop, opts);
    assert.equal(am.recent_action_counter, 0, 'a >20ms gap resets the counter');
});

test('fast-loop: counter > 3 cancels any pending resume', async () => {
    const agent = makeMockAgent();
    const am = new ActionManager(agent);
    am.resume_func = noop;
    am.resume_name = 'pending';
    for (let i = 0; i < 5; i++) await am.runAction('spin', noop, opts);
    // counter passes 3 → cancelResume() runs → resume_func nulled
    assert.equal(am.resume_func, null);
});

test('fast-loop: counter > 5 triggers cleanKill and an early failure return', async () => {
    const agent = makeMockAgent();
    const am = new ActionManager(agent);
    let res;
    for (let i = 0; i < 8; i++) res = await am.runAction('spin', noop, opts);
    assert.ok(agent.cleanKill.calls.length > 0, 'cleanKill must fire on an infinite loop');
    assert.equal(res.success, false);
    assert.match(res.message, /[Ii]nfinite action loop/);
});

test('goal-thrashing: 4 distinct labels in <10s warns + stops an active self-prompt', async () => {
    const sp = { isActive: () => true, isStopped: () => false, stopLoop: spy() };
    const agent = makeMockAgent({ self_prompter: sp });
    const am = new ActionManager(agent);
    for (const label of ['move', 'mine', 'craft', 'cook']) {
        await am.runAction(label, noop, opts);
    }
    assert.ok(sp.stopLoop.calls.length > 0, 'thrashing should stop the self-prompt loop');
    assert.ok(agent.history.add.calls.length > 0, 'thrashing should add a system note');
    assert.equal(am.recent_action_labels.length, 0, 'label history resets after a thrash trip');
});

test('goal-thrashing: repeating the SAME label does not trip the detector', async () => {
    const sp = { isActive: () => true, isStopped: () => false, stopLoop: spy() };
    const agent = makeMockAgent({ self_prompter: sp });
    const am = new ActionManager(agent);
    for (let i = 0; i < 6; i++) await am.runAction('mine', noop, opts);
    assert.equal(sp.stopLoop.calls.length, 0, 'one repeated label is not thrashing');
});

test('v1.1.43 regression: a thrown actionFn yields success:false with a real stack', async () => {
    const am = new ActionManager(makeMockAgent());
    const boom = async () => { throw new Error('kaboom'); };
    const res = await am.runAction('explode', boom, opts);
    assert.equal(res.success, false);
    assert.match(res.message, /kaboom/);
    // Pre-v1.1.43 the stack line read "Stack trace: undefined" because
    // `err` was coerced to a string before `.stack` was read.
    assert.match(res.message, /Stack trace:/);
    assert.doesNotMatch(res.message, /Stack trace:\s*undefined/);
});

test('v1.1.43 regression: _executeResume with a new resume but null label throws a real Error', async () => {
    const am = new ActionManager(makeMockAgent());
    // new_resume=true (actionFn passed) but actionLabel=null → must throw
    // a plain Error, not a ReferenceError from the old dead `assert` ref.
    await assert.rejects(
        () => am._executeResume(null, noop, 0),
        /actionLabel is required/
    );
});
