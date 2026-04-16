#!/usr/bin/env node
/**
 * Replay - Read a game log and replay events at configurable speed.
 * Displays events on a timeline with governance highlights.
 *
 * Usage: node scripts/replay.js [game_log.json] [speed_multiplier]
 * Example: node scripts/replay.js logs/games/game_2024-01-15.json 10
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CATEGORY_COLORS = {
    election_called: '\x1b[36m',      // Cyan
    election_result: '\x1b[36m\x1b[1m',
    law_proposed: '\x1b[33m',          // Yellow
    law_enacted: '\x1b[32m',           // Green
    law_rejected: '\x1b[31m',          // Red
    law_vetoed: '\x1b[35m',            // Magenta
    lawsuit_filed: '\x1b[33m',
    verdict_rendered: '\x1b[35m',
    combat_kill: '\x1b[31m\x1b[1m',
    combat_death: '\x1b[31m',
    resource_collected: '\x1b[37m',
    block_placed: '\x1b[37m',
    tax_paid: '\x1b[32m',
    trade_offered: '\x1b[34m',
    trade_accepted: '\x1b[34m\x1b[1m',
    treaty_proposed: '\x1b[36m',
    treaty_accepted: '\x1b[36m\x1b[1m',
    war_declared: '\x1b[31m\x1b[1m',
    bounty_placed: '\x1b[33m\x1b[1m',
    bounty_claimed: '\x1b[33m',
    impeachment_initiated: '\x1b[35m\x1b[1m',
    raid_called: '\x1b[31m',
    sabotage_called: '\x1b[31m',
};
const RESET = '\x1b[0m';

function findLatestLog() {
    const dir = './logs/games';
    const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) { console.error('No logs found.'); process.exit(1); }
    return join(dir, files[0]);
}

function formatTime(ms) {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}:${s.toString().padStart(2, '0')}`;
}

function formatEvent(event) {
    const color = CATEGORY_COLORS[event.type] || '';
    const time = formatTime(event.elapsed_ms);
    let details = '';

    switch (event.type) {
        case 'election_called': details = `${event.calledBy} calls election for ${event.office}`; break;
        case 'election_result': details = `${event.winner} wins ${event.office}! (${JSON.stringify(event.tally)})`; break;
        case 'law_proposed': details = `${event.proposedBy}: "${event.text}"`; break;
        case 'law_enacted': details = `Law #${event.law_id}: "${event.text}" (${event.yesVotes}y/${event.noVotes}n)`; break;
        case 'law_rejected': details = `Law #${event.law_id} rejected: "${event.text}"`; break;
        case 'law_vetoed': details = `VETO: Law #${event.law_id} "${event.text}" by ${event.president}`; break;
        case 'combat_kill': details = `${event.killer} (${event.killer_faction}) kills ${event.victim} (${event.victim_faction})`; break;
        case 'combat_death': details = `${event.agent} died: ${event.cause}`; break;
        case 'lawsuit_filed': details = `${event.plaintiff} sues ${event.defendant}: "${event.lawViolated}"`; break;
        case 'verdict_rendered': details = `${event.verdict}: ${event.defendant} - ${event.punishment}`; break;
        case 'trade_offered': details = `${event.offerer} offers ${event.give} to ${event.target} for ${event.want}`; break;
        case 'treaty_proposed': details = `${event.proposer} proposes to ${event.targetFaction}: "${event.terms}"`; break;
        case 'war_declared': details = `${event.declarer} declares war on ${event.targetFaction}!`; break;
        case 'bounty_placed': details = `${event.placer} puts bounty on ${event.target}: ${event.reward}`; break;
        default: details = JSON.stringify(event).substring(0, 100);
    }

    return `${color}[${time}] ${event.type}: ${details}${RESET}`;
}

async function replay(filepath, speed) {
    console.log(`\nReplaying: ${filepath} (${speed}x speed)\n`);
    const data = JSON.parse(readFileSync(filepath, 'utf8'));
    const events = data.events || [];

    // Filter to significant events
    const significantTypes = new Set([
        'election_called', 'election_result', 'nomination', 'vote_cast',
        'law_proposed', 'law_enacted', 'law_rejected', 'law_vetoed',
        'lawsuit_filed', 'verdict_rendered', 'impeachment_initiated',
        'combat_kill', 'combat_death',
        'trade_offered', 'trade_accepted',
        'treaty_proposed', 'treaty_accepted', 'war_declared',
        'bounty_placed', 'bounty_claimed',
        'tax_paid', 'raid_called', 'sabotage_called',
        'amendment_ratified', 'amendment_failed',
        'term_expired', 'punishment_completed', 'noncompliance_reported'
    ]);

    const significant = events.filter(e => significantTypes.has(e.type));

    console.log(`Total events: ${events.length}, Significant: ${significant.length}\n`);
    console.log('='.repeat(60));

    let lastElapsed = 0;
    for (const event of significant) {
        const delay = (event.elapsed_ms - lastElapsed) / speed;
        if (delay > 10) { // only sleep for noticeable gaps
            await new Promise(r => setTimeout(r, Math.min(delay, 2000)));
        }
        console.log(formatEvent(event));
        lastElapsed = event.elapsed_ms;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Replay complete. Duration: ${data.elapsedMinutes} minutes.`);

    if (data.scores) {
        console.log('\nFinal Scores:');
        for (const faction of ['constitutional', 'anarchy']) {
            const s = data.scores[faction];
            if (s) {
                console.log(`  ${faction}: Resources=${s.totalResources}, Kills=${s.kills}, Deaths=${s.deaths}, Blocks=${s.blocksPlaced}`);
            }
        }
    }
}

// Main
const logFile = process.argv[2] || findLatestLog();
const speed = parseInt(process.argv[3]) || 10;
replay(logFile, speed);
