#!/usr/bin/env node
/**
 * Test runner wrapper.
 *
 * Sets ANIMA_NO_PANTHEON=1 so Soul.lock() in tests doesn't append
 * test-souls to the canonical pantheon.md (which would pollute the
 * shared file across runs).
 *
 * v0.65: snapshot bots/ before the run and remove any directories that
 * were freshly created during testing. Tests use bots/<name>/ as
 * persistent storage; without cleanup, names like X / Y / irrelevant
 * leak from short actor stubs and confuse the substrate inspector.
 *
 * Cross-platform: works on Windows / macOS / Linux without needing
 * cross-env or shell-specific syntax.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync, statSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const testsDir = join(repoRoot, 'tests');
const botsDir  = join(repoRoot, 'bots');

if (!existsSync(testsDir)) {
    console.error('No tests/ directory found.');
    process.exit(1);
}

const testFiles = readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort()
    .map(f => join('tests', f));

if (testFiles.length === 0) {
    console.error('No .test.js files in tests/.');
    process.exit(1);
}

function snapshotBotDirs() {
    if (!existsSync(botsDir)) return new Set();
    try {
        const out = new Set();
        for (const name of readdirSync(botsDir)) {
            const path = join(botsDir, name);
            try {
                if (statSync(path).isDirectory()) out.add(name);
            } catch { /* skip unreadable */ }
        }
        return out;
    } catch {
        return new Set();
    }
}

const before = snapshotBotDirs();

const env = { ...process.env, ANIMA_NO_PANTHEON: '1' };
const result = spawnSync('node', ['--test', ...testFiles], { stdio: 'inherit', env });

// Sweep new bot dirs created by tests. Only deletes names that did NOT
// exist before this run started, so legitimate persistent agents are safe.
try {
    const after = snapshotBotDirs();
    const fresh = [...after].filter(n => !before.has(n));
    let removed = 0;
    for (const n of fresh) {
        try {
            rmSync(join(botsDir, n), { recursive: true, force: true });
            removed++;
        } catch { /* nonfatal */ }
    }
    if (removed > 0) {
        console.log(`[run_tests] swept ${removed} stray test bot dir${removed === 1 ? '' : 's'}: ${fresh.join(', ')}`);
    }
} catch { /* nonfatal */ }

process.exit(result.status ?? 0);
