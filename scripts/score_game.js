#!/usr/bin/env node
/**
 * Score Game - Analyze a completed game log and produce final scores.
 * Usage: node scripts/score_game.js [game_log.json]
 * If no file specified, uses the most recent game log.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SCORING_WEIGHTS = {
    totalResources: 0.25,
    resourceEquality: 0.15,
    survivalRate: 0.20,
    territoryControl: 0.15,
    infrastructure: 0.15,
    combatKills: 0.10
};

function findLatestLog() {
    const dir = './logs/games';
    try {
        const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
        if (files.length === 0) {
            console.error('No game logs found in ./logs/games/');
            process.exit(1);
        }
        return join(dir, files[0]);
    } catch (e) {
        console.error('Could not read game log directory:', e.message);
        process.exit(1);
    }
}

function analyzeLog(filepath) {
    console.log(`Analyzing: ${filepath}\n`);
    const data = JSON.parse(readFileSync(filepath, 'utf8'));
    const events = data.events || [];

    console.log(`Session: ${data.sessionId}`);
    console.log(`Duration: ${data.elapsedMinutes} minutes`);
    console.log(`Events: ${events.length}\n`);

    // Count by type
    const typeCounts = {};
    for (const e of events) {
        typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    }

    console.log('--- Event Breakdown ---');
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
    }

    // Scores
    if (data.scores) {
        console.log('\n--- Faction Scores ---');
        for (const faction of ['constitutional', 'anarchy']) {
            const s = data.scores[faction];
            if (!s) continue;
            console.log(`\n${faction.toUpperCase()}:`);
            console.log(`  Resources: ${s.totalResources}`);
            console.log(`  Gini: ${s.giniCoefficient?.toFixed(3) || 'N/A'}`);
            console.log(`  Kills: ${s.kills} | Deaths: ${s.deaths}`);
            console.log(`  Blocks: ${s.blocksPlaced}`);
            if (s.agentResources) {
                console.log('  Per-agent resources:');
                for (const [name, count] of Object.entries(s.agentResources)) {
                    console.log(`    ${name}: ${count}`);
                }
            }
        }
    }

    // Governance events
    const govEvents = events.filter(e => ['election_called', 'election_result', 'law_enacted', 'law_rejected', 'law_vetoed', 'lawsuit_filed', 'verdict_rendered', 'impeachment_initiated', 'amendment_ratified'].includes(e.type));
    if (govEvents.length > 0) {
        console.log('\n--- Governance Timeline ---');
        for (const e of govEvents) {
            const min = (e.elapsed_ms / 60000).toFixed(1);
            console.log(`  [${min}m] ${e.type}: ${JSON.stringify(e, ['type', 'timestamp', 'elapsed_ms', 'time'], 0).replace(/[{}"]/g, '').substring(0, 100)}`);
        }
    }
}

// Main
const logFile = process.argv[2] || findLatestLog();
analyzeLog(logFile);
