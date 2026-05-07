/**
 * v1.1.10 — package.json scripts hygiene.
 *
 * Every "scripts" entry should reference files that exist. This caught
 * `npm run forum` pointing at a non-existent scripts/run_scenario.js
 * — the npm script was dead and any user invoking it got a node
 * module-not-found error.
 *
 * The test: parse package.json, extract every `node <path>` reference
 * from the "scripts" object, assert each file exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

test('every node-script referenced from package.json scripts exists', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const missing = [];
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
        // Match every `node <path>` invocation — handles && chains too.
        const matches = cmd.matchAll(/\bnode\s+([^\s&|]+)/g);
        for (const m of matches) {
            const path = m[1];
            // Skip references that aren't relative file paths (e.g., bare
            // executables or url-style refs — none currently, but defensive).
            if (path.startsWith('-') || path.includes('://')) continue;
            const abs = join(repoRoot, path);
            if (!existsSync(abs)) {
                missing.push(`${name}: ${path}`);
            }
        }
    }
    assert.deepEqual(missing, [], `npm scripts reference missing files:\n  ${missing.join('\n  ')}`);
});

test('v1.1.11: replay.js and record.js import cleanly (no eager side effects)', async () => {
    // v1.1.11 specifically gated these two on isMainModule because
    // they were eagerly executing scandir / requiring an unbundled
    // puppeteer at import time. This test pins those fixes; broader
    // "every script imports cleanly" coverage would require gating
    // all scripts (substrate_demo, soul_inspector, etc.) which is
    // a future cleanup pass.
    const { pathToFileURL } = await import('url');
    const failures = [];
    for (const rel of ['scripts/replay.js', 'scripts/record.js']) {
        try {
            await import(pathToFileURL(join(repoRoot, rel)).href);
        } catch (e) {
            failures.push(`${rel}: ${e.message}`);
        }
    }
    assert.deepEqual(failures, [],
        `scripts that fail to import:\n  ${failures.join('\n  ')}`);
});
