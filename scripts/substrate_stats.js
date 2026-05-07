#!/usr/bin/env node
/**
 * Anima Substrate Stats — aggregate cognitive metrics across a roster.
 *
 * Usage:
 *   node scripts/substrate_stats.js
 *   npm run substrate-stats
 *   npm run substrate-stats -- --living      # exclude locked souls
 *   npm run substrate-stats -- --names X,Y,Z # specific names
 *
 * Where inspect_substrate gives one agent's full state and substrate-all
 * concatenates all of them, this gives the SHAPE of the cohort in tables:
 *   - mood-label distribution (how many tense / shaken / hopeful / etc.)
 *   - allostatic-level distribution (baseline / elevated / allostatic / overloaded)
 *   - dissonance level distribution (none / soft / loud)
 *   - average active belief count
 *   - persona-mask count
 *
 * Useful at end-of-game to see "is this cohort at the edge of collapse?"
 * or "did we just play through a high-dissonance run?"
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { Soul } from '../core/souls/soul.js';
import { Persona } from '../core/personas/persona.js';
import { getStress, stressLevel } from '../core/cognition/allostatic_load.js';
import { detectDissonance, detectPride } from '../core/cognition/dissonance.js';
import { dnaOf } from '../core/dna/soul_dna.js';
import { getFaction } from '../core/identity/faction.js';
import { OPTIMISM_THRESHOLD } from '../core/cognition/timescales.js';

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

let names = explicitNames && explicitNames.length > 0
    ? explicitNames
    : readdirSync(botsDir).filter(n => {
        const path = join(botsDir, n);
        try { return statSync(path).isDirectory(); } catch { return false; }
    });

if (livingOnly) names = names.filter(n => !new Soul(n).isLocked());

if (names.length === 0) {
    console.log('No agents matching filter.');
    process.exit(0);
}

// ── Collect per-agent metrics ────────────────────────────────────
const moodCounts = {};
const stressCounts = { baseline: 0, elevated: 0, allostatic: 0, overloaded: 0 };
const dissonanceCounts = { none: 0, soft: 0, loud: 0 };
const prideCounts = { none: 0, soft: 0, loud: 0 };
const optimismCounts = { optimist: 0, pessimist: 0, balanced: 0, 'no DNA': 0 };
const factionCounts = {};
let totalActiveBeliefs = 0;
let agentsWithBeliefs = 0;
let masked = 0;
let locked = 0;

for (const n of names) {
    if (new Soul(n).isLocked()) locked++;

    const mood = new AffectLog(n).currentMood();
    moodCounts[mood.label] = (moodCounts[mood.label] || 0) + 1;

    const level = stressLevel(getStress(n));
    if (level in stressCounts) stressCounts[level]++;

    const dis = detectDissonance(n, { recentN: Infinity });
    dissonanceCounts[dis.level]++;
    const pride = detectPride(n, { recentN: Infinity });
    prideCounts[pride.level]++;

    const ranked = new BeliefTable(n).rankedTargets();
    if (ranked.length > 0) {
        totalActiveBeliefs += ranked.length;
        agentsWithBeliefs++;
    }

    if (new Persona(n).isWearingMask()) masked++;

    const dna = dnaOf(n);
    if (!dna || typeof dna.trust !== 'number') optimismCounts['no DNA']++;
    else if (dna.trust >= OPTIMISM_THRESHOLD) optimismCounts.optimist++;
    else if (dna.trust <= -OPTIMISM_THRESHOLD) optimismCounts.pessimist++;
    else optimismCounts.balanced++;

    const f = getFaction(n);
    factionCounts[f] = (factionCounts[f] || 0) + 1;
}

const meanBeliefs = agentsWithBeliefs > 0
    ? (totalActiveBeliefs / agentsWithBeliefs).toFixed(1)
    : 'n/a';

// ── Render ───────────────────────────────────────────────────────
function bar() { return '─'.repeat(60); }

function distRow(label, count, total) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const dotcount = Math.round(pct / 5);
    const dots = '█'.repeat(dotcount).padEnd(20, '·');
    return `  ${label.padEnd(14)} ${String(count).padStart(3)}  [${dots}] ${pct}%`;
}

console.log('');
console.log('═'.repeat(60));
console.log(`  ANIMA SUBSTRATE COHORT STATS — ${names.length} agent${names.length === 1 ? '' : 's'}${livingOnly ? ' (living only)' : ''}`);
console.log('═'.repeat(60));

console.log('');
console.log(`  Locked:            ${locked} / ${names.length}`);
console.log(`  Wearing mask:      ${masked} / ${names.length}`);
console.log(`  Mean active beliefs (per agent with any): ${meanBeliefs}`);

console.log('');
console.log(`  ${bar()}`);
console.log('  ALLOSTATIC LEVEL DISTRIBUTION');
console.log(`  ${bar()}`);
for (const level of ['baseline', 'elevated', 'allostatic', 'overloaded']) {
    console.log(distRow(level, stressCounts[level], names.length));
}

console.log('');
console.log(`  ${bar()}`);
console.log('  DISSONANCE LEVEL DISTRIBUTION');
console.log(`  ${bar()}`);
for (const level of ['none', 'soft', 'loud']) {
    console.log(distRow(level, dissonanceCounts[level], names.length));
}

console.log('');
console.log(`  ${bar()}`);
console.log('  PRIDE LEVEL DISTRIBUTION');
console.log(`  ${bar()}`);
for (const level of ['none', 'soft', 'loud']) {
    console.log(distRow(level, prideCounts[level], names.length));
}

console.log('');
console.log(`  ${bar()}`);
console.log('  TRUST-AXIS POLARITY (optimism / pessimism)');
console.log(`  ${bar()}`);
for (const level of ['optimist', 'balanced', 'pessimist', 'no DNA']) {
    console.log(distRow(level, optimismCounts[level], names.length));
}

console.log('');
console.log(`  ${bar()}`);
console.log('  FACTION DISTRIBUTION');
console.log(`  ${bar()}`);
const sortedFactions = Object.entries(factionCounts).sort((a, b) => b[1] - a[1]);
for (const [label, count] of sortedFactions) {
    console.log(distRow(label, count, names.length));
}

console.log('');
console.log(`  ${bar()}`);
console.log('  MOOD LABEL DISTRIBUTION');
console.log(`  ${bar()}`);
const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
for (const [label, count] of sortedMoods) {
    console.log(distRow(label, count, names.length));
}

console.log('');
