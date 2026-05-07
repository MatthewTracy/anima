#!/usr/bin/env node
/**
 * Anima Soul Inspector — print the current soul census.
 *
 * Run between games to see who's alive, who's locked, what each soul looks
 * like at a glance.
 *
 * Usage: npm run souls
 *        node scripts/soul_inspector.js                # summary
 *        node scripts/soul_inspector.js --full         # full soul text for everyone
 *        node scripts/soul_inspector.js <name>         # full soul text for one agent
 */

import { readFileSync } from 'fs';
import { listAllSouls } from '../core/souls/soul.js';
import { getLineage } from '../core/souls/lineage.js';

const args = process.argv.slice(2);
const wantFull = args.includes('--full');
const targetName = args.find(a => !a.startsWith('--'));

function bar() {
    return '─'.repeat(70);
}

function printSummary() {
    const all = listAllSouls();
    if (all.length === 0) {
        console.log('No souls yet. Run a game first.');
        return;
    }
    const alive = all.filter(s => !s.isLocked());
    const locked = all.filter(s => s.isLocked());

    console.log('');
    console.log('ANIMA — Soul Census');
    console.log(bar());
    console.log('');

    if (alive.length > 0) {
        console.log('ALIVE');
        console.log('─────');
        for (const s of alive) {
            const lineage = getLineage(s.name);
            const lineageNote = lineage
                ? `  ⟵ ${lineage.lineage.slice(0, 2).join(' ⟵ ')}${lineage.depth > 2 ? ' ⟵ ...' : ''}`
                : '';
            console.log('  ' + s.oneLineSummary() + lineageNote);
        }
        console.log('');
    }

    if (locked.length > 0) {
        console.log('LOCKED — frozen in legend');
        console.log('─────────────────────────');
        for (const s of locked) {
            console.log('  ' + s.oneLineSummary());
        }
        console.log('');
    }

    console.log(`Total: ${all.length} souls (${alive.length} alive, ${locked.length} locked).`);
    console.log('');
    console.log('Run with --full to see every soul, or pass a name to inspect one.');
}

function printOne(name) {
    const all = listAllSouls();
    const found = all.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!found) {
        console.log(`No soul found for "${name}". Available: ${all.map(s => s.name).join(', ')}`);
        return;
    }
    console.log('');
    console.log(bar());
    console.log(found.oneLineSummary());
    console.log(bar());
    const text = found.read();
    if (text) {
        console.log('');
        console.log(text);
    }
    if (found.isLocked()) {
        try {
            const marker = readFileSync(found.diedMarkerPath, 'utf8');
            console.log(bar());
            console.log('DEATH MARKER');
            console.log(marker);
        } catch { /* ignore */ }
    }
    console.log('');
}

function printAll() {
    const all = listAllSouls();
    if (all.length === 0) {
        console.log('No souls yet.');
        return;
    }
    for (const s of all) {
        console.log('');
        console.log(bar());
        console.log(s.oneLineSummary());
        console.log(bar());
        const text = s.read();
        if (text) console.log(text);
        if (s.isLocked()) {
            try {
                const marker = readFileSync(s.diedMarkerPath, 'utf8');
                console.log('-- DEATH MARKER --');
                console.log(marker);
            } catch { /* ignore */ }
        }
    }
    console.log('');
}

if (targetName) {
    printOne(targetName);
} else if (wantFull) {
    printAll();
} else {
    printSummary();
}
