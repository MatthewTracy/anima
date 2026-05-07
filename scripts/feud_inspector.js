#!/usr/bin/env node
/**
 * Anima Feud Inspector — visualize the cross-game antagonism graph.
 *
 * Usage:
 *   npm run feuds                    # full graph, edges sorted by weight
 *   node scripts/feud_inspector.js <name>   # all feuds involving one agent
 */

import { FeudTracker, ANTAGONISM_WEIGHTS } from '../core/feuds/feud_tracker.js';

const args = process.argv.slice(2);
const targetName = args.find(a => !a.startsWith('--'));

function bar() { return '─'.repeat(70); }

function printAll() {
    const tracker = new FeudTracker();
    const edges = tracker.allEdges();
    if (edges.length === 0) {
        console.log('');
        console.log('ANIMA — Feud Graph');
        console.log(bar());
        console.log('No feuds yet. Either no antagonistic events have fired, or no scenarios');
        console.log('have run yet through auto_update with antagonistic actions.');
        console.log('');
        return;
    }
    console.log('');
    console.log(`ANIMA — Feud Graph  (${edges.length} edge${edges.length === 1 ? '' : 's'})`);
    console.log(bar());
    console.log('');
    for (const e of edges) {
        const recent = e.entries.slice(-4).map(en => `${en.type}@${en.scenario}`).join(', ');
        console.log(`  ${e.actor} → ${e.target}   weight ${e.total_weight}, ${e.count} act${e.count === 1 ? '' : 's'}`);
        console.log(`     recent: ${recent}`);
    }
    console.log('');
    // Severity legend
    console.log('Severity weights:');
    const sorted = Object.entries(ANTAGONISM_WEIGHTS).sort((a, b) => b[1] - a[1]);
    for (const [type, w] of sorted) {
        if (w > 0) console.log(`  ${String(w).padStart(2)}  ${type}`);
    }
    console.log('');
}

function printOne(name) {
    const tracker = new FeudTracker();
    const grievances = tracker.topAggressorsAgainst(name, 20);
    const reputation = tracker.topVictimsOf(name, 20);
    console.log('');
    console.log(`Feuds involving ${name}`);
    console.log(bar());
    if (grievances.length === 0 && reputation.length === 0) {
        console.log(`No antagonisms recorded involving ${name}.`);
        console.log('');
        return;
    }
    if (grievances.length > 0) {
        console.log('');
        console.log('Grievances (what was done TO you):');
        for (const e of grievances) {
            const recent = e.entries.slice(-4).map(en => `${en.type}@${en.scenario}`).join(', ');
            console.log(`  ${e.actor} → ${name}    weight ${e.total_weight}, ${e.count} act${e.count === 1 ? '' : 's'}`);
            console.log(`    recent: ${recent}`);
        }
    }
    if (reputation.length > 0) {
        console.log('');
        console.log("Reputation (what you've done to others, others remember):");
        for (const e of reputation) {
            const recent = e.entries.slice(-4).map(en => `${en.type}@${en.scenario}`).join(', ');
            console.log(`  ${name} → ${e.target}    weight ${e.total_weight}, ${e.count} act${e.count === 1 ? '' : 's'}`);
            console.log(`    recent: ${recent}`);
        }
    }
    console.log('');
}

if (targetName) printOne(targetName);
else printAll();
