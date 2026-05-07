/**
 * Tests for src/agent/commands/index.js blacklistCommands.
 *
 * v1.1.52: blacklistCommands used \`delete commandList.find(...)\` which
 * is a no-op (delete on a function-call result does nothing). Fix
 * splices the index out properly. This test exercises the fix.
 *
 * NOTE: src/agent/commands/index.js transitively imports
 * src/utils/mcdata.js which depends on the 'minecraft-data' npm package.
 * If that's not installed, the test gracefully skips. With it installed
 * (e.g. on CI / after `npm install`), the test fully exercises the fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('v1.1.52: blacklistCommands removes from BOTH commandMap and commandList', async (t) => {
    let mod;
    try {
        mod = await import('../src/agent/commands/index.js');
    } catch (e) {
        if (e.message.includes("minecraft-data") || e.message.includes("Cannot find package")) {
            t.skip(`skipping: dev dep not installed (${e.message})`);
            return;
        }
        throw e;
    }
    const { blacklistCommands, commandExists, getCommandDocs } = mod;

    // Pick a non-unblockable command that exists by default
    const target = '!stand';   // existing but blockable command
    if (!commandExists(target)) {
        t.skip(`expected target command ${target} not present`);
        return;
    }

    // Pre-fix the docs would still mention the blacklisted command
    // because the dead `delete commandList.find(...)` did nothing.
    blacklistCommands([target]);

    assert.ok(!commandExists(target),
        `${target} must be removed from commandMap after blacklist`);

    // commandList is iterated by getCommandDocs — assert the docs
    // no longer mention the blacklisted command.
    const docs = getCommandDocs({ governance: false, combat: false });
    assert.ok(!docs.includes(target),
        `${target} must NOT appear in getCommandDocs after blacklist; docs:\n${docs.slice(0, 500)}`);
});
