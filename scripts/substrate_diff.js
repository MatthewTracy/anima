#!/usr/bin/env node
/**
 * Anima Substrate Diff — compare two agents' cognitive state side-by-side.
 *
 * Usage:
 *   node scripts/substrate_diff.js <agentA> <agentB>
 *   npm run substrate-diff -- _DemoMother _DemoSoldier
 *
 * Pure read-only. After substrate_demo.js or any real game, you often
 * want to ask "how did these two agents diverge?" — same events, but
 * because of personality, faction, prior trust, and accumulated state,
 * each ends up somewhere different. This script renders the most
 * comparable axes side-by-side in fixed-width columns.
 *
 * Sections:
 *   IDENTITY     — soul exists, locked, faction, dominant DNA axis
 *   MOOD + LOAD  — current mood, allostatic level
 *   BELIEFS      — top-3 most-charged relationships per agent
 *   AFFECT       — top-2 felt moments per agent (with role tags)
 *   DMN          — first sentence of each agent's most recent rumination
 */

import { existsSync } from 'fs';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { Soul } from '../core/souls/soul.js';
import { getFaction } from '../core/identity/faction.js';
import { dnaOf } from '../core/dna/soul_dna.js';
import { getStress, stressLevel } from '../core/cognition/allostatic_load.js';
import { readLatestMusings } from '../core/cognition/dmn.js';

const args = process.argv.slice(2);
const a = args[0];
const b = args[1];

if (!a || !b) {
    console.error('Usage: node scripts/substrate_diff.js <agentA> <agentB>');
    process.exit(2);
}

for (const n of [a, b]) {
    if (!existsSync(`./bots/${n}`)) {
        console.error(`No bot directory at ./bots/${n}`);
        process.exit(1);
    }
}

const W = 35;   // column width

function pad(s, w = W) {
    s = String(s ?? '');
    return s.length >= w ? s.slice(0, w - 1) + '…' : s + ' '.repeat(w - s.length);
}

function header() {
    console.log('');
    console.log(`  ${pad(a)} │ ${pad(b)}`);
    console.log(`  ${'─'.repeat(W)}─┼─${'─'.repeat(W)}`);
}

function row(left, right) {
    console.log(`  ${pad(left)} │ ${pad(right)}`);
}

function section(label) {
    console.log('');
    console.log(`  ${'═'.repeat(W * 2 + 3)}`);
    console.log(`  ${label}`);
    console.log(`  ${'═'.repeat(W * 2 + 3)}`);
}

console.log('');
console.log('═'.repeat(W * 2 + 5));
console.log(`  ANIMA SUBSTRATE DIFF — ${a} ╳ ${b}`);
console.log('═'.repeat(W * 2 + 5));

// ── Identity ─────────────────────────────────────────────────────
section('IDENTITY');
const soulA = new Soul(a);
const soulB = new Soul(b);
header();
row(`soul exists: ${soulA.exists() ? 'yes' : 'no'}`,
    `soul exists: ${soulB.exists() ? 'yes' : 'no'}`);
row(`locked: ${soulA.isLocked() ? 'YES' : 'no'}`,
    `locked: ${soulB.isLocked() ? 'YES' : 'no'}`);
row(`faction: ${getFaction(a)}`, `faction: ${getFaction(b)}`);

// Dominant DNA axis
function dominantAxis(name) {
    const dna = dnaOf(name);
    if (!dna) return 'no DNA';
    let best = null, bestAbs = 0;
    for (const [axis, w] of Object.entries(dna)) {
        if (Math.abs(w) > bestAbs) { best = { axis, w }; bestAbs = Math.abs(w); }
    }
    if (!best || bestAbs < 0.3) return 'balanced';
    const sign = best.w > 0 ? '+' : '';
    return `${best.axis} ${sign}${best.w.toFixed(2)}`;
}
row(`dominant axis: ${dominantAxis(a)}`, `dominant axis: ${dominantAxis(b)}`);

// ── Mood & Load ──────────────────────────────────────────────────
section('MOOD + LOAD');
const moodA = new AffectLog(a).currentMood();
const moodB = new AffectLog(b).currentMood();
const loadA = getStress(a);
const loadB = getStress(b);
header();
row(`mood: ${moodA.label} (v ${moodA.valence > 0 ? '+' : ''}${moodA.valence})`,
    `mood: ${moodB.label} (v ${moodB.valence > 0 ? '+' : ''}${moodB.valence})`);
row(`load: ${loadA.toFixed(2)} (${stressLevel(loadA)})`,
    `load: ${loadB.toFixed(2)} (${stressLevel(loadB)})`);

// ── Beliefs ──────────────────────────────────────────────────────
section('TOP-3 BELIEFS BY |TRUST|');
function topBeliefs(name, n = 3) {
    const ranked = new BeliefTable(name).rankedTargets()
        .slice().sort((x, y) => Math.abs(y.trust) - Math.abs(x.trust))
        .slice(0, n);
    return ranked.map(t => `${t.name}: ${t.trust > 0 ? '+' : ''}${t.trust.toFixed(2)}`);
}
const bA = topBeliefs(a);
const bB = topBeliefs(b);
header();
const maxRows = Math.max(bA.length, bB.length, 1);
for (let i = 0; i < maxRows; i++) {
    row(bA[i] || '(none)', bB[i] || '(none)');
}

// ── Affect ───────────────────────────────────────────────────────
section('TOP-2 FELT MOMENTS');
function topAffect(name, n = 2) {
    return new AffectLog(name).topMoments(n).map(m => {
        const sign = m.valence > 0 ? '+' : '';
        const role = (m.role || '?').padEnd(9);
        return `[${sign}${m.valence.toFixed(2)}] (${role}) ${m.type}`;
    });
}
const aA = topAffect(a);
const aB = topAffect(b);
header();
const maxAff = Math.max(aA.length, aB.length, 1);
for (let i = 0; i < maxAff; i++) {
    row(aA[i] || '(none)', aB[i] || '(none)');
}

// ── DMN ──────────────────────────────────────────────────────────
section('DMN — first sentence of latest rumination');
function firstSentence(name) {
    const m = readLatestMusings(name);
    if (!m) return '(no musings)';
    const idx = m.indexOf('. ');
    return idx > 0 ? m.slice(0, idx + 1) : m.slice(0, 100);
}
console.log(`  ${a}:  ${firstSentence(a)}`);
console.log(`  ${b}:  ${firstSentence(b)}`);

console.log('');
