/**
 * Shared mock-agent helper for src/agent/ unit tests (v1.1.69).
 *
 * NOT a test file — the leading underscore and the absence of a
 * `.test.js` suffix keep scripts/run_tests.js's `tests/*.test.js`
 * glob from executing it.
 *
 * The real Agent wires a live mineflayer bot, sockets, an LLM
 * prompter, and the cognitive substrate together. The agent-runtime
 * classes (ActionManager, SelfPrompter, …) only ever touch a small
 * slice of that surface. makeMockAgent() returns a minimal stand-in
 * exposing exactly that slice, so the real classes can be unit-tested
 * with no Minecraft connection. Pass `overrides` to shape the slice a
 * given test needs.
 */

/** A tiny call-recording spy: `fn.calls` is an array of argument-arrays. */
export function spy(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

export function makeMockAgent(overrides = {}) {
    const agent = {
        name: '_TestAgent',
        last_sender: null,
        shut_up: false,
        bot: {
            output: '',
            interrupt_code: false,
            lastDamageTime: 0,
            emit: spy(),
        },
        actions: {
            executing: false,
            currentActionLabel: '',
            stop: spy(async () => {}),
            cancelResume: spy(),
        },
        history: {
            add: spy(async () => {}),
            save: spy(),
        },
        task: { taskStartTime: 0 },
        // Default self_prompter: inactive. ActionManager touches
        // self_prompter.isActive() / .stopLoop(); SelfPrompter tests
        // instantiate the real class separately.
        self_prompter: { isActive: () => false, isStopped: () => true, stopLoop: spy() },
        isIdle: () => true,
        openChat: spy(),
        handleMessage: spy(async () => ''),
        clearBotLogs: spy(),
        requestInterrupt: spy(),
        cleanKill: spy(),
        ...overrides,
    };
    return agent;
}
