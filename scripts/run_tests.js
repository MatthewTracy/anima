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
import { readdirSync, existsSync, statSync, rmSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const testsDir = join(repoRoot, 'tests');
const botsDir  = join(repoRoot, 'bots');
const logsDir  = join(repoRoot, 'logs');

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

// v1.1.26: snapshot logs/ entries and pantheon.md too. Tests trigger
// writes to ./logs/feuds.json, ./logs/budget/, ./logs/commitments/,
// etc. via auto_update side-effects, and the v1.1.18 pantheon test
// creates pantheon.md. Without sweeping these, a fresh-repo `npm test`
// leaves debris that confuses `git status` and the substrate inspector.
function snapshotLogsEntries() {
    if (!existsSync(logsDir)) return new Set();
    try {
        return new Set(readdirSync(logsDir));
    } catch {
        return new Set();
    }
}
function pantheonExisted() {
    return existsSync(join(repoRoot, 'pantheon.md'));
}

const before = snapshotBotDirs();
const logsBefore = snapshotLogsEntries();
const pantheonBefore = pantheonExisted();

const env = { ...process.env, ANIMA_NO_PANTHEON: '1' };
// v1.1.20: process.execPath instead of bare 'node' so the test suite
// runs on the same Node binary as the wrapper (matters for nvm setups
// where shell PATH may resolve 'node' to a different installed version).
const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit', env });

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

// v1.1.26: logs/ sweep — remove any logs/ entry that didn't exist
// before the run.
try {
    const logsAfter = snapshotLogsEntries();
    const freshLogs = [...logsAfter].filter(n => !logsBefore.has(n));
    let removed = 0;
    for (const n of freshLogs) {
        try {
            rmSync(join(logsDir, n), { recursive: true, force: true });
            removed++;
        } catch { /* nonfatal */ }
    }
    if (removed > 0) {
        console.log(`[run_tests] swept ${removed} stray logs/ entr${removed === 1 ? 'y' : 'ies'}: ${freshLogs.join(', ')}`);
    }
} catch { /* nonfatal */ }

// v1.1.26: pantheon.md sweep — if the file didn't exist before but
// does now (test created it), remove it.
try {
    const pantheonPath = join(repoRoot, 'pantheon.md');
    if (!pantheonBefore && existsSync(pantheonPath)) {
        unlinkSync(pantheonPath);
        console.log('[run_tests] swept stray pantheon.md created during tests');
    }
} catch { /* nonfatal */ }

process.exit(result.status ?? 0);
