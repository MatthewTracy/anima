#!/usr/bin/env node
/**
 * Anima Substrate Cohort — run inspect_substrate.js for every agent
 * directory under bots/ and concatenate the output.
 *
 * Usage:
 *   node scripts/substrate_all.js
 *   npm run substrate-all
 *   npm run substrate-all -- --living     # skip locked souls
 *   npm run substrate-all -- --names X,Y  # specific names
 *
 * After running a real game (or substrate_demo.js), this lets you
 * survey the whole cohort's cognitive state in one terminal scroll.
 *
 * Pure read-only. No mutation.
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Soul } from '../core/souls/soul.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const botsDir  = join(repoRoot, 'bots');

const args = process.argv.slice(2);
const livingOnly = args.includes('--living');
const namesFlagIdx = args.indexOf('--names');
const explicitNames = namesFlagIdx >= 0 ? (args[namesFlagIdx + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null;

if (!existsSync(botsDir)) {
    console.error('No bots/ directory yet. Run a scenario first.');
    process.exit(1);
}

let names;
if (explicitNames && explicitNames.length > 0) {
    names = explicitNames;
} else {
    names = readdirSync(botsDir).filter(n => {
        const path = join(botsDir, n);
        try { return statSync(path).isDirectory(); } catch { return false; }
    });
}

if (livingOnly) {
    names = names.filter(n => !new Soul(n).isLocked());
}

if (names.length === 0) {
    console.log('No agents to inspect (none matching filter).');
    process.exit(0);
}

console.log('');
console.log('═'.repeat(70));
console.log(`  ANIMA SUBSTRATE COHORT — ${names.length} agent${names.length === 1 ? '' : 's'}${livingOnly ? ' (living only)' : ''}`);
console.log('═'.repeat(70));

for (const name of names.sort()) {
    const result = spawnSync('node', ['scripts/inspect_substrate.js', name], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
    process.stdout.write(result.stdout || '');
    if (result.stderr) process.stderr.write(result.stderr);
}
