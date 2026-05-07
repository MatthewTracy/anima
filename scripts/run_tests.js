#!/usr/bin/env node
/**
 * Test runner wrapper.
 *
 * Sets ANIMA_NO_PANTHEON=1 so Soul.lock() in tests doesn't append
 * test-souls to the canonical pantheon.md (which would pollute the
 * shared file across runs).
 *
 * Cross-platform: works on Windows / macOS / Linux without needing
 * cross-env or shell-specific syntax.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, '..', 'tests');

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

const env = { ...process.env, ANIMA_NO_PANTHEON: '1' };
const result = spawnSync('node', ['--test', ...testFiles], { stdio: 'inherit', env });
process.exit(result.status ?? 0);
