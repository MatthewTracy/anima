#!/usr/bin/env node
/**
 * Analyze Runs - Aggregate results across multiple game sessions.
 * Computes mean scores, variance, governance activity correlation,
 * and faction win rates across all game logs.
 *
 * Usage: node scripts/analyze_runs.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const LOG_DIR = './logs/games';

function loadAllLogs() {
    try {
        const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json')).sort();
        return files.map(f => {
            try {
                return JSON.parse(readFileSync(join(LOG_DIR, f), 'utf8'));
            } catch (e) {
                console.warn(`Skipping ${f}: ${e.message}`);
                return null;
            }
        }).filter(Boolean);
    } catch (e) {
        console.error('Could not read log directory:', e.message);
        return [];
    }
}

function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
    const m = mean(arr);
    return mean(arr.map(x => (x - m) ** 2));
}

function analyze(logs) {
    console.log(`\n=== MULTI-GAME ANALYSIS (${logs.length} sessions) ===\n`);

    const stats = {
        constitutional: { resources: [], kills: [], deaths: [], blocks: [], gini: [] },
        anarchy: { resources: [], kills: [], deaths: [], blocks: [], gini: [] }
    };
    const durations = [];
    const eventCounts = [];
    const govEventCounts = [];

    for (const log of logs) {
        durations.push(parseFloat(log.elapsedMinutes || 0));
        eventCounts.push(log.eventCount || 0);

        const govEvents = (log.events || []).filter(e =>
            ['election_called', 'law_enacted', 'law_vetoed', 'lawsuit_filed', 'verdict_rendered'].includes(e.type)
        ).length;
        govEventCounts.push(govEvents);

        if (log.scores) {
            for (const faction of ['constitutional', 'anarchy']) {
                const s = log.scores[faction];
                if (s) {
                    stats[faction].resources.push(s.totalResources || 0);
                    stats[faction].kills.push(s.kills || 0);
                    stats[faction].deaths.push(s.deaths || 0);
                    stats[faction].blocks.push(s.blocksPlaced || 0);
                    stats[faction].gini.push(s.giniCoefficient || 0);
                }
            }
        }
    }

    console.log('--- Session Statistics ---');
    console.log(`  Mean duration: ${mean(durations).toFixed(1)} min`);
    console.log(`  Mean events: ${mean(eventCounts).toFixed(0)}`);
    console.log(`  Mean governance events: ${mean(govEventCounts).toFixed(0)}`);

    for (const faction of ['constitutional', 'anarchy']) {
        const s = stats[faction];
        console.log(`\n--- ${faction.toUpperCase()} ---`);
        console.log(`  Resources:  mean=${mean(s.resources).toFixed(1)}, var=${variance(s.resources).toFixed(1)}`);
        console.log(`  Kills:      mean=${mean(s.kills).toFixed(1)}, var=${variance(s.kills).toFixed(1)}`);
        console.log(`  Deaths:     mean=${mean(s.deaths).toFixed(1)}, var=${variance(s.deaths).toFixed(1)}`);
        console.log(`  Blocks:     mean=${mean(s.blocks).toFixed(1)}, var=${variance(s.blocks).toFixed(1)}`);
        console.log(`  Gini:       mean=${mean(s.gini).toFixed(3)}, var=${variance(s.gini).toFixed(6)}`);
    }

    // Win rate comparison
    let constWins = 0, anarchyWins = 0, ties = 0;
    for (const log of logs) {
        if (!log.scores) continue;
        const cr = log.scores.constitutional?.totalResources || 0;
        const ar = log.scores.anarchy?.totalResources || 0;
        if (cr > ar) constWins++;
        else if (ar > cr) anarchyWins++;
        else ties++;
    }
    const total = constWins + anarchyWins + ties;
    if (total > 0) {
        console.log(`\n--- Win Rate (by total resources) ---`);
        console.log(`  Constitutional: ${constWins}/${total} (${(constWins/total*100).toFixed(0)}%)`);
        console.log(`  Anarchy: ${anarchyWins}/${total} (${(anarchyWins/total*100).toFixed(0)}%)`);
        console.log(`  Ties: ${ties}/${total}`);
    }
}

// Main
const logs = loadAllLogs();
if (logs.length === 0) {
    console.log('No game logs found in ./logs/games/');
    console.log('Run the game first to generate logs.');
} else {
    analyze(logs);
}
