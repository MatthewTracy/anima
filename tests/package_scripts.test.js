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

test('v1.1.35: core/director/director.js imports cleanly even without openai', async () => {
    // Pre-fix, director.js had `import OpenAIApi from 'openai'` at module
    // top — so `import('./core/director/director.js')` crashed hard for
    // any consumer when the npm package wasn't installed (tests, future
    // inspectors, anyone running without `npm install`). v1.1.35 deferred
    // the openai import to the actual call site of consultDirector,
    // mirroring the v1.1.11 record.js fix. Lock the contract.
    const { pathToFileURL } = await import('url');
    const url = pathToFileURL(join(repoRoot, 'core/director/director.js')).href;
    const mod = await import(url);
    assert.ok(typeof mod.consultDirector === 'function',
        'consultDirector must be exported');
    assert.ok(typeof mod.maybeFireDirector === 'function',
        'maybeFireDirector must be exported');
});

test('v1.1.45: src/governance/autobiographies.js imports cleanly even without openai', async () => {
    // Same dynamic-import contract as director.js. Pre-fix, the eager
    // `import OpenAIApi from 'openai'` at the top of autobiographies.js
    // crashed any consumer when the npm package was absent. v1.1.45
    // deferred the import to the call site of generateAutobiographies.
    const { pathToFileURL } = await import('url');
    const url = pathToFileURL(join(repoRoot, 'src/governance/autobiographies.js')).href;
    const mod = await import(url);
    assert.ok(typeof mod.generateAutobiographies === 'function',
        'generateAutobiographies must be exported');
});

test('v1.1.46: evolution / reflection / post_game_summary import without openai', async () => {
    // v1.1.46 generalized the v1.1.35/v1.1.45 fix into a shared
    // core/runtime/load_openai.js helper and applied it to the remaining
    // non-runner files.
    const { pathToFileURL } = await import('url');
    const targets = [
        ['core/runtime/load_openai.js', 'loadOpenAI'],
        ['core/souls/evolution.js', 'evolveAllSouls'],
        ['src/governance/reflection.js', 'reflectOnAction'],
        ['src/governance/post_game_summary.js', 'generatePostGameSummary']
    ];
    for (const [rel, expectedExport] of targets) {
        const url = pathToFileURL(join(repoRoot, rel)).href;
        const mod = await import(url);
        assert.ok(typeof mod[expectedExport] === 'function',
            `${rel} must export ${expectedExport} (clean import without openai)`);
    }
});

test('v1.1.47: all four scenario runners import cleanly (no eager main, no eager openai)', async () => {
    // Pre-fix the runners (1) imported openai at module top, and
    // (2) called main().catch(...) unconditionally. Either alone made
    // them unimportable in environments without openai, and the auto-
    // main meant tests / utilities couldn't even check the file's
    // exports without triggering process.exit(1) when API keys were
    // missing. v1.1.46 fixed (1) via the shared loadOpenAI helper;
    // v1.1.47 fixed (2) by gating main() on isMainModule.
    const { pathToFileURL } = await import('url');
    const runners = [
        'scenarios/cloister/runner.js',
        'scenarios/crew/runner.js',
        'scenarios/outpost/runner.js',
        'scenarios/cell/runner.js'
    ];
    for (const rel of runners) {
        const url = pathToFileURL(join(repoRoot, rel)).href;
        // Pre-fix this would trigger main() and process.exit(1) on missing
        // OPENROUTER_API_KEY. With the gate, importing is a no-op effect-wise.
        await import(url);
    }
});
