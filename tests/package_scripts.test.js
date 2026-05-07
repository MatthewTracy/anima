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
