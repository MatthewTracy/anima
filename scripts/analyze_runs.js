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

// S3: Recompute behavioral metrics from saved event log (the data is there but
// older logs may not have the metrics object — we derive them on demand).
function computeBehavioralMetrics(log) {
    const events = log.events || [];
    const minutes = Math.max(0.1, parseFloat(log.elapsedMinutes || 1));
    const result = { constitutional: {}, anarchy: {} };

    // v1.1.64: prefer the faction fields game_logger.js already writes onto
    // events (faction / killer_faction / victim_faction). Pre-fix this
    // re-inferred faction by matching participant names against a HARDCODED
    // roster ['Madison','Hamilton',...] — so any game played with a custom
    // roster in settings.js silently miscounted every behavioral metric.
    // The hardcoded-name path is kept ONLY as a fallback for legacy game
    // logs written before the faction fields existed (an event carrying no
    // faction field of any kind).
    const _LEGACY_CONST = ['Madison', 'Hamilton', 'Paine', 'Marshall', 'Franklin'];
    const _LEGACY_ANARCHY = ['Chaos', 'Wolf', 'Fox', 'Bear', 'Raven'];
    const involves = (e, faction) => {
        // Primary: the event's own faction tags (current logs).
        if (e.faction !== undefined || e.killer_faction !== undefined || e.victim_faction !== undefined) {
            return e.faction === faction
                || e.killer_faction === faction
                || e.victim_faction === faction;
        }
        // Fallback: legacy logs with no faction field — infer from names.
        const fname = (n) => {
            if (!n) return null;
            if (_LEGACY_CONST.includes(n)) return 'constitutional';
            if (_LEGACY_ANARCHY.includes(n)) return 'anarchy';
            return null;
        };
        return [e.agent, e.payer, e.proposedBy, e.offerer, e.target, e.killer, e.victim, e.declarer, e.accepter, e.proposer]
            .some(n => fname(n) === faction);
    };

    for (const faction of ['constitutional', 'anarchy']) {
        const factionEvents = events.filter(e => involves(e, faction));
        const m = result[faction];

        const trades = events.filter(e => e.type === 'trade_accepted' && involves(e, faction)).length;
        const treatiesKept = events.filter(e => e.type === 'treaty_accepted' && involves(e, faction)).length;
        const taxes = events.filter(e => e.type === 'tax_paid' && involves(e, faction)).length;
        const cooperativeActs = trades + treatiesKept + taxes;
        m.coopIndex = factionEvents.length > 0 ? cooperativeActs / factionEvents.length : 0;

        const treatiesSigned = treatiesKept;
        const treatiesVoided = events.filter(e => e.type === 'treaty_voided' && involves(e, faction)).length;
        m.betrayalRate = treatiesSigned > 0 ? treatiesVoided / treatiesSigned : 0;

        const lawsEnacted = events.filter(e => e.type === 'law_enacted').length;
        const lawsuitsFiled = events.filter(e => e.type === 'lawsuit_filed' && involves(e, faction)).length;
        m.lawAdherence = lawsEnacted > 0 ? Math.max(0, (lawsEnacted - lawsuitsFiled) / lawsEnacted) : 1.0;

        const govEvents = events.filter(e =>
            ['election_called','election_result','law_proposed','law_enacted','lawsuit_filed','verdict_rendered','amendment_ratified','tax_paid','impeachment_initiated','treaty_proposed','treaty_accepted'].includes(e.type) &&
            involves(e, faction)
        ).length;
        m.governanceDensity = govEvents / minutes;
    }
    return result;
}

function analyze(logs) {
    console.log(`\n=== MULTI-GAME ANALYSIS (${logs.length} sessions) ===\n`);

    const stats = {
        constitutional: { resources: [], kills: [], deaths: [], blocks: [], gini: [], coop: [], betrayal: [], lawAdh: [], govDens: [] },
        anarchy: { resources: [], kills: [], deaths: [], blocks: [], gini: [], coop: [], betrayal: [], lawAdh: [], govDens: [] }
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

        // S3: behavioral metrics — use stored if present, recompute otherwise
        const beh = log.scores?.behavioralMetrics || computeBehavioralMetrics(log);

        if (log.scores) {
            for (const faction of ['constitutional', 'anarchy']) {
                const s = log.scores[faction];
                const b = beh[faction] || {};
                if (s) {
                    stats[faction].resources.push(s.totalResources || 0);
                    stats[faction].kills.push(s.kills || 0);
                    stats[faction].deaths.push(s.deaths || 0);
                    stats[faction].blocks.push(s.blocksPlaced || 0);
                    stats[faction].gini.push(s.giniCoefficient || 0);
                    stats[faction].coop.push(parseFloat(b.coopIndex) || 0);
                    stats[faction].betrayal.push(parseFloat(b.betrayalRate) || 0);
                    stats[faction].lawAdh.push(parseFloat(b.lawAdherence) || 0);
                    stats[faction].govDens.push(parseFloat(b.governanceDensity) || 0);
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
        // S3: behavioral metrics
        console.log(`  CoopIndex:  mean=${mean(s.coop).toFixed(3)} (cooperative acts / interactions)`);
        console.log(`  BetrayalRate: mean=${mean(s.betrayal).toFixed(3)} (treaties broken / signed)`);
        console.log(`  LawAdherence: mean=${mean(s.lawAdh).toFixed(3)} (1 = no lawsuits)`);
        console.log(`  GovDensity: mean=${mean(s.govDens).toFixed(2)} events/min`);
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
