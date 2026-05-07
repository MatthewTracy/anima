#!/usr/bin/env node
/**
 * Anima Substrate Inspector — print every layer of cognitive state for one agent.
 *
 * Usage:
 *   node scripts/inspect_substrate.js <agent>
 *
 * Reads the agent's bots/<name>/ directory and synthesizes a single report
 * covering all eleven cognitive substrate layers documented in
 * docs/COGNITIVE_SUBSTRATE.md. Useful when debugging "why did this agent
 * react the way they did?" — collects affect, beliefs, recursive beliefs,
 * burdens, faction, DNA, allostatic load, exposure history, stress level,
 * mood, top-N moments (raw + congruent), and recent musings into one view.
 *
 * No LLM calls. No mutation. Pure read.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AffectLog } from '../core/affect/affect.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../core/beliefs/recursive_belief.js';
import { Burden } from '../core/burdens/burden.js';
import { Persona } from '../core/personas/persona.js';
import { Soul } from '../core/souls/soul.js';
import { getFaction } from '../core/identity/faction.js';
import { dnaOf } from '../core/dna/soul_dna.js';
import { getStress, stressLevel } from '../core/cognition/allostatic_load.js';
import { readLatestMusings } from '../core/cognition/dmn.js';
import { exposureFactor, explainExposure } from '../core/cognition/habituation.js';
import { OPTIMISM_THRESHOLD } from '../core/cognition/timescales.js';

const args = process.argv.slice(2);
const agent = args[0];

if (!agent) {
    console.error('Usage: node scripts/inspect_substrate.js <agent>');
    console.error('');
    console.error('Prints every cognitive substrate layer for one agent in a single report.');
    process.exit(2);
}

const dir = join('./bots', agent);
if (!existsSync(dir)) {
    console.error(`No bot directory at ${dir}. Has this agent ever been seeded?`);
    process.exit(1);
}

function bar(c = '─') { return c.repeat(70); }
function header(label) {
    console.log('');
    console.log(bar());
    console.log(`  ${label}`);
    console.log(bar());
}

console.log('');
console.log(bar('═'));
console.log(`  ANIMA SUBSTRATE INSPECTOR — ${agent}`);
console.log(bar('═'));

// ── Identity layer ───────────────────────────────────────────────
header('IDENTITY');
const soul = new Soul(agent);
console.log(`  Soul exists:       ${soul.exists() ? 'yes' : 'no (never seeded)'}`);
console.log(`  Locked at death:   ${soul.isLocked() ? 'YES — soul is permanent' : 'no'}`);
console.log(`  Faction:           ${getFaction(agent)}`);

const dna = dnaOf(agent);
if (dna) {
    console.log(`  Soul DNA (value vector):`);
    for (const [axis, weight] of Object.entries(dna)) {
        const sign = weight > 0 ? '+' : '';
        const bar = '|'.repeat(Math.round(Math.abs(weight) * 10));
        const dir = weight > 0.3 ? `→ ${axis}` : weight < -0.3 ? `→ opposite` : 'balanced';
        // v0.97: surface the v0.93 optimism interpretation on the trust axis.
        let extra = '';
        if (axis === 'trust') {
            if (weight >= OPTIMISM_THRESHOLD) extra = '   [OPTIMIST: positive deltas amplified, negative dampened]';
            else if (weight <= -OPTIMISM_THRESHOLD) extra = '   [PESSIMIST: negative deltas amplified, positive dampened]';
        }
        console.log(`    ${axis.padEnd(10)} ${sign}${weight.toFixed(2)}  ${bar.padEnd(10)} ${dir}${extra}`);
    }
} else {
    console.log(`  Soul DNA:          (no soul.md found)`);
}

// ── Affect layer ─────────────────────────────────────────────────
header('AFFECT (per-event amygdala-tagged log)');
const log = new AffectLog(agent);
const mood = log.currentMood();
console.log(`  Current mood:      ${mood.label} (valence ${mood.valence > 0 ? '+' : ''}${mood.valence}, arousal ${mood.arousal})`);
// v0.98: name the Russell circumplex quadrant for the mood, so a reader
// who isn't fluent in the label vocabulary still sees where the agent
// sits in 2D affect space.
{
    const v = mood.valence, a = mood.arousal;
    let quadrant;
    if (a < 0.20) quadrant = v >= 0 ? 'low-arousal positive (settled, content quadrant)' : 'low-arousal negative (numb, withdrawn quadrant)';
    else if (a < 0.50) quadrant = v >= 0.20 ? 'mild-arousal positive (content)' : v >= -0.20 ? 'mild-arousal neutral (watchful)' : 'mild-arousal negative (wary)';
    else if (v >= 0.10) quadrant = v >= 0.40 ? 'high-arousal positive (elated)' : 'high-arousal mildly positive (hopeful)';
    else if (v >= -0.10) quadrant = 'high-arousal neutral (tense)';
    else quadrant = v >= -0.40 ? 'high-arousal negative (shaken)' : 'high-arousal extreme negative (devastated)';
    console.log(`  Quadrant:          ${quadrant}`);
}

const top = log.topMoments(5);
if (top.length === 0) {
    console.log(`  No affect log entries.`);
} else {
    console.log(`  Top moments by raw magnitude:`);
    for (const m of top) {
        const sign = m.valence > 0 ? '+' : '';
        const role = m.role || '?';
        const subj = m.actor ? ` by ${m.actor}` : '';
        const targ = m.target ? ` on ${m.target}` : '';
        console.log(`    [${sign}${m.valence.toFixed(2)}/${m.arousal.toFixed(2)} mag ${m.magnitude.toFixed(2)}] (${role.padEnd(9)}) ${m.type}${subj}${targ}`);
    }
}

const cong = log.congruentMoments(5);
if (cong.length > 0 && JSON.stringify(cong) !== JSON.stringify(top)) {
    console.log(`  Mood-congruent retrieval (what surfaces given current mood):`);
    for (const m of cong) {
        const sign = m.valence > 0 ? '+' : '';
        const role = m.role || '?';
        console.log(`    [${sign}${m.valence.toFixed(2)}] (${role}) ${m.type}${m.actor ? ' by ' + m.actor : ''}`);
    }
}

// ── Habituation / sensitization ──────────────────────────────────
header('HABITUATION (per-event-type response curves)');
const habitPath = `./bots/${agent}/habituation.json`;
if (!existsSync(habitPath)) {
    console.log('  (no exposure history yet)');
} else {
    try {
        const habitData = JSON.parse(readFileSync(habitPath, 'utf8'));
        const types = Object.keys(habitData.byEvent || {});
        if (types.length === 0) {
            console.log('  (no exposure history yet)');
        } else {
            // Sort by raw count descending — most-experienced types first
            const summary = types.map(t => {
                const list = habitData.byEvent[t] || [];
                const arousal = list.length > 0 ? list[list.length - 1].arousal : 0;
                const factor = exposureFactor(agent, t, arousal);
                const explain = explainExposure(agent, t, arousal);
                return { t, count: list.length, factor, mode: explain.mode };
            }).sort((a, b) => b.count - a.count);
            console.log(`  ${'event type'.padEnd(20)} count  factor  mode`);
            for (const s of summary) {
                const tag = s.mode === 'habituating' ? '↓' : s.mode === 'sensitizing' ? '↑' : '·';
                console.log(`  ${s.t.padEnd(20)} ${String(s.count).padStart(5)}  ${s.factor.toFixed(2).padStart(5)}  ${tag} ${s.mode}`);
            }
        }
    } catch (e) {
        console.log(`  (failed to read habituation log: ${e.message})`);
    }
}

// ── Allostatic load ──────────────────────────────────────────────
header('ALLOSTATIC LOAD (slow-moving stress reservoir)');
const load = getStress(agent);
const level = stressLevel(load);
const bars = '█'.repeat(Math.round(load * 20));
const empty = '░'.repeat(20 - bars.length);
console.log(`  Load:              [${bars}${empty}] ${load.toFixed(2)}`);
console.log(`  Level:             ${level}`);

// ── Beliefs ──────────────────────────────────────────────────────
header('BELIEFS (per-target trust + evidence)');
const beliefs = new BeliefTable(agent);
const ranked = beliefs.rankedTargets();
if (ranked.length === 0) {
    console.log(`  No beliefs about anyone yet.`);
} else {
    for (const t of ranked) {
        const sign = t.trust > 0 ? '+' : '';
        const recent = t.evidence?.length ? ` — last: "${t.evidence[t.evidence.length - 1].reason}"` : '';
        console.log(`  ${t.name.padEnd(18)} ${sign}${t.trust.toFixed(2)}${recent}`);
    }
}

// ── Recursive beliefs (theory of mind) ───────────────────────────
header('RECURSIVE BELIEFS (what I think they think of me)');
const refl = new RecursiveBeliefTable(agent);
const text = refl.asPromptText();
console.log(text || '  (none recorded)');

// ── Burden (private hidden state) ────────────────────────────────
header('BURDEN (private hidden state — only you know this)');
const burden = new Burden(agent);
const burdenText = burden.asPromptText();
console.log(burdenText || '  (none — clean slate)');

// ── Persona (active mask, if any) ────────────────────────────────
header('PERSONA (active mask)');
const persona = new Persona(agent);
const active = persona.read();
if (active) {
    console.log(`  Wearing mask:      "${active.alias}"`);
    if (active.bio) console.log(`  Claimed bio:       ${active.bio}`);
    if (active.motive) console.log(`  Motive:            ${active.motive}`);
    if (active.adoptedAt) console.log(`  Adopted:           ${active.adoptedAt}`);
} else {
    console.log('  (no active mask — face is the agent\'s own)');
}
const masks = persona.history();
if (masks.length > 0) {
    console.log(`  Past masks:        ${masks.length} (most recent: "${masks[masks.length - 1].alias}", ${masks[masks.length - 1].endedAt?.slice(0, 10) || '?'})`);
}

// ── DMN (rumination) ─────────────────────────────────────────────
header('DEFAULT MODE NETWORK (most recent rumination)');
const musing = readLatestMusings(agent);
if (musing) {
    console.log('  ' + musing.split('\n').join('\n  '));
} else {
    console.log('  (no musings persisted yet)');
}

console.log('');
console.log(bar('═'));
console.log('');
