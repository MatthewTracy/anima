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
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
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

test('v1.1.23: every scenario.json roster has matching character profile files', () => {
    // The audit found that scenarios/outpost/ had 5 missing character
    // profiles after v0.5.0 — only hale.json remained, but the roster
    // listed six names. Anyone running `npm run outpost` got an
    // immediate ENOENT crash.
    //
    // Lock the regression: for every scenarios/<name>/scenario.json,
    // verify scenarios/<name>/characters/<rostername-lowercase>.json
    // exists. (Cell uses a different layout: characters/<rostername>.json
    // mixed-case — handled below.)
    const scenariosRoot = join(repoRoot, 'scenarios');
    const failures = [];
    for (const scenarioDir of readdirSync(scenariosRoot)) {
        if (!statSync(join(scenariosRoot, scenarioDir)).isDirectory()) continue;
        const manifestPath = join(scenariosRoot, scenarioDir, 'scenario.json');
        if (!existsSync(manifestPath)) continue;     // forum/ is intentionally empty
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (!manifest.roster) continue;
        const charsDir = join(scenariosRoot, scenarioDir, 'characters');
        for (const name of manifest.roster) {
            // Try both lowercase and mixed-case (different scenarios use
            // different conventions; both are accepted by their runners).
            const lower = join(charsDir, name.toLowerCase() + '.json');
            const mixed = join(charsDir, name + '.json');
            if (!existsSync(lower) && !existsSync(mixed)) {
                failures.push(`${scenarioDir}: missing character profile for ${name} (looked for ${name.toLowerCase()}.json or ${name}.json)`);
            }
        }
    }
    assert.deepEqual(failures, [],
        `scenarios with missing character profiles:\n  ${failures.join('\n  ')}`);
});

test('v1.1.33: library_search CLI accepts a single-word query without --kinds', () => {
    // Regression: the arg parser used `i !== kindsIdx + 1` to skip the
    // value of --kinds. When --kinds was absent, kindsIdx was -1 and the
    // expression became `i !== 0` — silently dropping args[0]. So a
    // single-word query like `library_search.js silence` fell through to
    // the stats banner instead of running a search.
    const script = join(repoRoot, 'scripts', 'library_search.js');
    const result = spawnSync(process.execPath, [script, 'xyzzy_no_match_expected_zzz'], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, `script crashed: ${result.stderr}`);
    // It should have entered SEARCH mode (which prints the query) — NOT
    // the stats mode (which prints "Library Stats").
    assert.match(result.stdout, /search "xyzzy_no_match_expected_zzz"/,
        `single-word query was dropped — stdout was:\n${result.stdout}`);
    assert.doesNotMatch(result.stdout, /Library Stats/,
        `single-word query incorrectly fell through to stats mode`);
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
