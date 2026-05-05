#!/usr/bin/env node
/**
 * Sweep (P1) — runs N games per parameter value and dumps a CSV with
 * behavioral metrics per game. Turns N=1 anecdotes into N≥3 curves.
 *
 * Usage:
 *   node scripts/sweep.js tax_rate 0,0.1,0.2,0.3 --runs 3
 *   node scripts/sweep.js president_term_ms 300000,600000,900000 --runs 5 --duration 6
 *
 * Output: logs/sweeps/sweep-<timestamp>.csv
 */

import { spawn } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node scripts/sweep.js <param> <values> [--runs N] [--duration M]');
    console.error('Example: node scripts/sweep.js tax_rate 0,0.1,0.2,0.3 --runs 3');
    process.exit(1);
}

const paramName = args[0];
const paramValues = args[1].split(',').map(v => isNaN(Number(v)) ? v : Number(v));
const runsIdx = args.indexOf('--runs');
const numRuns = runsIdx >= 0 ? parseInt(args[runsIdx + 1]) : 3;
const durIdx = args.indexOf('--duration');
const duration = durIdx >= 0 ? parseInt(args[durIdx + 1]) : 6;

console.log(`\n=== SWEEP: ${paramName} ∈ {${paramValues.join(', ')}} × ${numRuns} runs × ${duration} min/game ===\n`);
console.log(`Total games: ${paramValues.length * numRuns}`);
console.log(`Estimated cost (DeepSeek): ~$${(paramValues.length * numRuns * 0.05).toFixed(2)}\n`);

function buildSettingsOverride(paramName, value, duration) {
    // Map param names to settings paths
    const overrides = {
        game_clock: { enabled: true, duration_minutes: duration }
    };
    // Governance params
    if (['tax_rate', 'amendment_threshold', 'veto_override_threshold',
         'president_term_ms', 'judge_term_ms', 'nomination_period_ms',
         'voting_period_ms', 'law_voting_period_ms'].includes(paramName)) {
        overrides.governance = { [paramName]: value };
    }
    // Clock params
    else if (['duration_minutes'].includes(paramName)) {
        overrides.game_clock.duration_minutes = value;
    }
    // Win conditions
    else if (paramName === 'first_to_resources') {
        overrides.win_conditions = { first_to_resources: { enabled: true, threshold: value } };
    }
    // Generic fallback — set top-level key
    else {
        overrides[paramName] = value;
    }
    return JSON.stringify(overrides);
}

async function runOneGame(paramValue, runIndex) {
    return new Promise((resolve, reject) => {
        const settingsOverride = buildSettingsOverride(paramName, paramValue, duration);
        console.log(`[SWEEP] ${paramName}=${paramValue} run ${runIndex + 1}/${numRuns}`);
        const proc = spawn(process.execPath, ['main.js'], {
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, SETTINGS_JSON: settingsOverride }
        });
        const killTimer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch (e) {}
        }, (duration * 60 + 90) * 1000);
        proc.on('exit', () => { clearTimeout(killTimer); resolve(); });
        proc.on('error', (err) => {
            clearTimeout(killTimer);
            try { proc.kill('SIGKILL'); } catch (e) {}
            console.error(`[SWEEP] run failed: ${err.message}`);
            resolve(); // continue sweep on individual failure
        });
    });
}

function loadLatestGameLog(beforeTimestamp) {
    // Find the most recent game log AFTER the given timestamp
    const dir = './logs/games';
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter(f => f.endsWith('.json'))
        .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
        .filter(f => f.mtime >= beforeTimestamp)
        .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) return null;
    try {
        return JSON.parse(readFileSync(join(dir, files[0].name), 'utf8'));
    } catch (e) {
        return null;
    }
}

(async () => {
    const sweepStart = Date.now();
    const rows = [];
    rows.push(['param', 'value', 'run', 'sessionId', 'duration_min',
               'const_resources', 'const_kills', 'const_gini', 'const_coop', 'const_betrayal', 'const_lawAdh', 'const_govDens',
               'anarchy_resources', 'anarchy_kills', 'anarchy_gini', 'anarchy_coop', 'anarchy_betrayal', 'anarchy_lawAdh', 'anarchy_govDens',
               'winner']);

    for (const value of paramValues) {
        for (let run = 0; run < numRuns; run++) {
            const startMark = Date.now();
            await runOneGame(value, run);
            const log = loadLatestGameLog(startMark - 5000);
            if (!log) {
                rows.push([paramName, value, run + 1, 'MISSING', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                continue;
            }
            const cs = log.scores?.constitutional || {};
            const as = log.scores?.anarchy || {};
            const cb = log.scores?.behavioralMetrics?.constitutional || {};
            const ab = log.scores?.behavioralMetrics?.anarchy || {};
            const winner = (cs.totalResources || 0) > (as.totalResources || 0) ? 'constitutional'
                          : (as.totalResources || 0) > (cs.totalResources || 0) ? 'anarchy' : 'tie';
            rows.push([
                paramName, value, run + 1, log.sessionId, log.elapsedMinutes,
                cs.totalResources || 0, cs.kills || 0, (cs.giniCoefficient || 0).toFixed(3),
                cb.coopIndex || 0, cb.betrayalRate || 0, cb.lawAdherence || 0, cb.governanceDensity || 0,
                as.totalResources || 0, as.kills || 0, (as.giniCoefficient || 0).toFixed(3),
                ab.coopIndex || 0, ab.betrayalRate || 0, ab.lawAdherence || 0, ab.governanceDensity || 0,
                winner
            ]);
            // Brief pause between games for cleanup
            await new Promise(r => setTimeout(r, 20000));
        }
    }

    const sweepDir = './logs/sweeps';
    if (!existsSync(sweepDir)) mkdirSync(sweepDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = join(sweepDir, `sweep-${paramName}-${ts}.csv`);
    const csv = rows.map(r => r.join(',')).join('\n');
    writeFileSync(outPath, csv);
    console.log(`\n[SWEEP] Wrote ${rows.length - 1} rows to ${outPath}`);
    console.log(`[SWEEP] Total elapsed: ${((Date.now() - sweepStart) / 60000).toFixed(1)} min`);
})();
