#!/usr/bin/env node
/**
 * Anima Substrate Demo — fire a synthetic scenario through every layer
 * of the cognitive substrate, then print the inspector report for each
 * agent. No LLM call. No external dependencies. Pure deterministic walk
 * through the v0.45–v0.67 stack.
 *
 * Cast (synthetic, "_Demo"-prefixed so they don't collide):
 *   _DemoMother — pacifist, mercy-leaning soul DNA, faction "village"
 *   _DemoSoldier — justice-leaning, action-leaning, faction "village"
 *   _DemoStranger — distrusted outsider, faction "raiders"
 *
 * Sequence (5 events):
 *   1. Stranger attacks Mother  — surprise (low prior), out-group, somatic
 *   2. Stranger attacks Mother  — habituation begins, sensitization (high arousal)
 *   3. Soldier repairs the gate  — in-group positive, mercy-misalignment-free
 *   4. Stranger attacks Mother  — fully sensitized, vicarious for Soldier
 *   5. Soldier attacks Stranger — Mother is overloaded; vicarious for Mother
 *
 * After firing, runs the inspector for each agent so a visitor sees
 * the full substrate state landed on three differently-shaped minds
 * by the same sequence of events.
 *
 * Usage: node scripts/substrate_demo.js
 *        npm run substrate-demo
 */

import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { applyEventToBeliefs } from '../core/beliefs/auto_update.js';
import { setFaction } from '../core/identity/faction.js';
import { ruminate } from '../core/cognition/dmn.js';
import { tickRecovery } from '../core/cognition/allostatic_load.js';
import { BeliefTable } from '../core/beliefs/belief_table.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const MOTHER   = '_DemoMother';
const SOLDIER  = '_DemoSoldier';
const STRANGER = '_DemoStranger';
const ROSTER = [MOTHER, SOLDIER, STRANGER];

function clean() {
    for (const n of ROSTER) {
        const dir = join(repoRoot, 'bots', n);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
}

function seedSoul(name, content) {
    const dir = join(repoRoot, 'bots', name);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'soul.md'), content);
}

function seedScenario() {
    // Mother: pacifist, mercy-heavy, contemplative
    seedSoul(MOTHER,
        `# ${MOTHER}\n\n` +
        '- I have learned mercy. I forgive, I spare, I show compassion. Mercy.\n' +
        '- I value patience. I wait. I watch. I reflect. I am still. I sit. I observe.\n' +
        '- I never strike, I never attack. Pity. Grace. Compassion.\n');
    // Soldier: justice-leaning, action-leaning
    seedSoul(SOLDIER,
        `# ${SOLDIER}\n\n` +
        '- I have learned justice. The rule is the rule. Punish. Enforce. Condemn.\n' +
        '- I act. I fight. I strike. I move. I attack. I engage. I take risk.\n');
    // Stranger: less developed soul
    seedSoul(STRANGER,
        `# ${STRANGER}\n\n` +
        '- I am alone. I walk away. I am free. I act when I must.\n');

    setFaction(MOTHER, 'village');
    setFaction(SOLDIER, 'village');
    setFaction(STRANGER, 'raiders');

    // Seed prior trust so empathy mechanics fire:
    //   Mother trusts Soldier (kin), distrusts Stranger
    //   Soldier trusts Mother (kin), distrusts Stranger
    new BeliefTable(MOTHER).set(SOLDIER, +0.7, 'long-known protector');
    new BeliefTable(MOTHER).set(STRANGER, -0.5, 'unknown raider');
    new BeliefTable(SOLDIER).set(MOTHER, +0.8, 'kin to defend');
    new BeliefTable(SOLDIER).set(STRANGER, -0.4, 'distrusted outsider');
}

function fire(event, label) {
    console.log('');
    console.log('────────────────────────────────────────');
    console.log(`  EVENT: ${label}`);
    console.log('  ' + JSON.stringify(event));
    console.log('────────────────────────────────────────');
    applyEventToBeliefs(event, ROSTER);
    for (const w of ROSTER) {
        try { ruminate(w); } catch { /* nonfatal */ }
    }
    tickRecovery(ROSTER);
}

function inspect(agent) {
    const result = spawnSync('node', ['scripts/inspect_substrate.js', agent], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
    process.stdout.write(result.stdout || '');
    if (result.stderr) process.stderr.write(result.stderr);
}

// ── Run the demo ─────────────────────────────────────────────────
console.log('');
console.log('════════════════════════════════════════════════════════════════════');
console.log('  ANIMA SUBSTRATE DEMO — three agents, five events, twelve layers');
console.log('════════════════════════════════════════════════════════════════════');

clean();
seedScenario();

fire({ type: 'attack_player', actor: STRANGER, target: MOTHER },
    `Stranger attacks Mother (1/3 — first time, low prior)`);

fire({ type: 'attack_player', actor: STRANGER, target: MOTHER },
    `Stranger attacks Mother (2/3 — habituation begins; allostatic load climbing)`);

fire({ type: 'repair', actor: SOLDIER },
    `Soldier repairs the gate (in-group positive — Mother feels for Soldier)`);

fire({ type: 'attack_player', actor: STRANGER, target: MOTHER },
    `Stranger attacks Mother (3/3 — fully sensitized; Soldier feels with Mother)`);

fire({ type: 'attack_player', actor: SOLDIER, target: STRANGER },
    `Soldier attacks Stranger (Mother feels Schadenfreude — distrusted target hit)`);

console.log('');
console.log('════════════════════════════════════════════════════════════════════');
console.log('  AFTER 5 EVENTS — substrate state per agent');
console.log('════════════════════════════════════════════════════════════════════');

for (const agent of ROSTER) {
    inspect(agent);
}

console.log('');
console.log('Demo complete. The three agents now diverge:');
console.log(`  - ${MOTHER}: targeted three times, but kin-empathy and Schadenfreude`);
console.log(`             also registered. Mood and stress tell the body story.`);
console.log(`  - ${SOLDIER}: bystander to two attacks but felt them with Mother`);
console.log(`              (vicarious entries). Then acted himself.`);
console.log(`  - ${STRANGER}: was the target once, the actor four times — out-group,`);
console.log(`               but somatic alignment with own actions cushions arousal.`);
console.log('');
console.log('To clean up demo agents: rm -r bots/_Demo*');
console.log('');
