#!/usr/bin/env node
/**
 * Tournament (#12) — runs N games back-to-back and aggregates results.
 *
 * Usage:
 *   node scripts/tournament.js 5             # 5 games
 *   node scripts/tournament.js 5 20          # 5 games, 20 minutes each
 *   node scripts/tournament.js 5 20 3v3      # 5 games, 20 min, 3v3 mode
 *
 * Each game produces logs as normal. After the run, prints aggregate stats:
 * win rate by faction, mean scores, mean kills, governance activity, etc.
 */

import { spawn } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const numGames = parseInt(process.argv[2]) || 3;
const durationMinutes = parseInt(process.argv[3]) || 15;
const mode = process.argv[4] || '3v3';

console.log(`\n=== TOURNAMENT: ${numGames} games × ${durationMinutes} min, ${mode} ===\n`);

async function resetMinecraftWorld() {
    // B8: stop, wipe world data, restart for a clean slate between games
    console.log('[TOURNAMENT] Resetting Minecraft world...');
    return new Promise((resolve) => {
        const stop = spawn('docker', ['compose', 'stop', 'minecraft'], { stdio: 'inherit' });
        stop.on('exit', () => {
            const rm = spawn('docker', ['compose', 'rm', '-f', 'minecraft'], { stdio: 'inherit' });
            rm.on('exit', () => {
                const up = spawn('docker', ['compose', 'up', '-d', 'minecraft'], { stdio: 'inherit' });
                up.on('exit', () => {
                    // Wait for healthy
                    setTimeout(resolve, 90000); // 90s for fresh world generation
                });
            });
        });
    });
}

async function runGame(index) {
    console.log(`\n--- Game ${index + 1}/${numGames} starting ---`);

    // Override settings via environment variable
    const settingsOverride = JSON.stringify({
        game_clock: { enabled: true, duration_minutes: durationMinutes }
    });

    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, ['main.js'], {
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, SETTINGS_JSON: settingsOverride }
        });

        // Force exit after duration + 60s grace period
        const killTimer = setTimeout(() => {
            console.log(`[TOURNAMENT] Game ${index + 1} timed out, force killing`);
            try { proc.kill('SIGKILL'); } catch (e) {}
        }, (durationMinutes * 60 + 90) * 1000);

        proc.on('exit', (code) => {
            clearTimeout(killTimer);
            console.log(`--- Game ${index + 1} ended (exit ${code}) ---`);
            resolve();
        });
        proc.on('error', (err) => {
            clearTimeout(killTimer);
            // B8: properly reject so the runner knows this game failed
            try { proc.kill('SIGKILL'); } catch (e) {}
            console.error(`[TOURNAMENT] Game ${index + 1} process error:`, err.message);
            reject(err);
        });
    });
}

function aggregate() {
    console.log(`\n=== TOURNAMENT RESULTS ===\n`);
    const dir = './logs/games';
    const files = readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-numGames);

    const stats = {
        constitutional: { wins: 0, totalScore: 0, kills: 0, deaths: 0, resources: 0 },
        anarchy: { wins: 0, totalScore: 0, kills: 0, deaths: 0, resources: 0 },
        ties: 0,
        totalGames: files.length,
        avgEvents: 0,
        avgGovEvents: 0
    };

    for (const f of files) {
        try {
            const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
            const cs = data.scores?.constitutional || {};
            const as = data.scores?.anarchy || {};

            stats.constitutional.totalScore += cs.totalResources || 0;
            stats.anarchy.totalScore += as.totalResources || 0;
            stats.constitutional.kills += cs.kills || 0;
            stats.anarchy.kills += as.kills || 0;
            stats.constitutional.deaths += cs.deaths || 0;
            stats.anarchy.deaths += as.deaths || 0;
            stats.constitutional.resources += cs.totalResources || 0;
            stats.anarchy.resources += as.totalResources || 0;

            // Count win using totalResources as tiebreaker
            if ((cs.totalResources || 0) > (as.totalResources || 0)) stats.constitutional.wins++;
            else if ((as.totalResources || 0) > (cs.totalResources || 0)) stats.anarchy.wins++;
            else stats.ties++;

            stats.avgEvents += (data.events?.length || 0);
            stats.avgGovEvents += (data.events || []).filter(e =>
                ['election_called', 'law_enacted', 'lawsuit_filed', 'verdict_rendered'].includes(e.type)
            ).length;
        } catch (e) {
            console.warn(`Skipped ${f}: ${e.message}`);
        }
    }

    if (stats.totalGames > 0) {
        stats.avgEvents /= stats.totalGames;
        stats.avgGovEvents /= stats.totalGames;
    }

    console.log(`Games analyzed: ${stats.totalGames}/${numGames}`);
    console.log(`\nWin Rate:`);
    console.log(`  Constitutional: ${stats.constitutional.wins}/${stats.totalGames} (${(stats.constitutional.wins / stats.totalGames * 100 || 0).toFixed(0)}%)`);
    console.log(`  Anarchy:        ${stats.anarchy.wins}/${stats.totalGames} (${(stats.anarchy.wins / stats.totalGames * 100 || 0).toFixed(0)}%)`);
    console.log(`  Ties:           ${stats.ties}/${stats.totalGames}`);
    console.log(`\nAverage Resources:`);
    console.log(`  Constitutional: ${(stats.constitutional.resources / stats.totalGames || 0).toFixed(1)}`);
    console.log(`  Anarchy:        ${(stats.anarchy.resources / stats.totalGames || 0).toFixed(1)}`);
    console.log(`\nAverage Combat:`);
    console.log(`  Constitutional kills: ${(stats.constitutional.kills / stats.totalGames || 0).toFixed(1)}, deaths: ${(stats.constitutional.deaths / stats.totalGames || 0).toFixed(1)}`);
    console.log(`  Anarchy kills:        ${(stats.anarchy.kills / stats.totalGames || 0).toFixed(1)}, deaths: ${(stats.anarchy.deaths / stats.totalGames || 0).toFixed(1)}`);
    console.log(`\nGovernance Activity (per game):`);
    console.log(`  Avg events: ${stats.avgEvents.toFixed(0)}`);
    console.log(`  Avg governance events: ${stats.avgGovEvents.toFixed(1)} (elections + laws + lawsuits + verdicts)`);
}

const FRESH_WORLD = process.argv.includes('--fresh-world');

(async () => {
    for (let i = 0; i < numGames; i++) {
        try {
            if (FRESH_WORLD && i > 0) {
                // B8: optionally wipe world between games for true reproducibility
                await resetMinecraftWorld();
            } else if (i > 0) {
                // Brief pause to let Minecraft cleanup
                await new Promise(r => setTimeout(r, 30000));
            }
            await runGame(i);
        } catch (e) {
            console.error(`Game ${i + 1} failed:`, e?.message || e);
        }
    }
    aggregate();
})();
