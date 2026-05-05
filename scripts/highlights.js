#!/usr/bin/env node
/**
 * Highlights (P2) — score events by drama and dump the top moments.
 * Drama = stakes (combat, governance) + surprise (rare event types) +
 *         reciprocity (counter-attacks, betrayals after trust).
 *
 * Usage:
 *   node scripts/highlights.js                                # latest game
 *   node scripts/highlights.js logs/games/game_<id>.json     # specific
 *   node scripts/highlights.js --top 20                       # top 20 (default 10)
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const args = process.argv.slice(2);
const topIdx = args.indexOf('--top');
const TOP_N = topIdx >= 0 ? parseInt(args[topIdx + 1]) : 10;
const fileArg = args.find(a => a.endsWith('.json'));

function findLatestLog() {
    const dir = './logs/games';
    if (!existsSync(dir)) { console.error('No logs/games/ directory.'); process.exit(1); }
    const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) { console.error('No game logs found.'); process.exit(1); }
    return join(dir, files[0]);
}

const filepath = fileArg || findLatestLog();
console.log(`\n=== HIGHLIGHTS for ${basename(filepath)} ===\n`);
const data = JSON.parse(readFileSync(filepath, 'utf8'));
const events = data.events || [];

// Drama scoring weights per event type
const TYPE_DRAMA = {
    combat_kill: 5,
    combat_death: 4,
    impeachment_initiated: 8,
    law_vetoed: 7,
    war_declared: 9,
    treaty_voided: 7,
    treaty_accepted: 5,
    treaty_proposed: 3,
    election_result: 4,
    law_enacted: 3,
    law_rejected: 2,
    lawsuit_filed: 5,
    verdict_rendered: 6,
    bounty_placed: 5,
    bounty_claimed: 7,
    raid_called: 4,
    sabotage_called: 5,
    relationship_change: 1,
    amendment_ratified: 6,
    damage_taken: 1
};

// Compute reciprocity bonus: attacked-then-died, betrayal-after-trust
function reciprocityBonus(event, allEvents, idx) {
    let bonus = 0;
    // Combat kill within 60s of victim's prior kill = revenge
    if (event.type === 'combat_kill') {
        const recent = allEvents.slice(Math.max(0, idx - 50), idx)
            .filter(e => e.type === 'combat_kill' && e.killer === event.victim && e.victim === event.killer);
        if (recent.length > 0) bonus += 3; // revenge kill
    }
    // War after a treaty — F3: search treaty_proposed (has faction fields) and
    // verify it was accepted via the matching treaty_accepted event.
    if (event.type === 'war_declared' && event.declarerFaction && event.targetFaction) {
        const matchingProposal = allEvents.slice(0, idx).find(e =>
            e.type === 'treaty_proposed' &&
            ((e.proposerFaction === event.declarerFaction && e.targetFaction === event.targetFaction) ||
             (e.proposerFaction === event.targetFaction && e.targetFaction === event.declarerFaction))
        );
        if (matchingProposal) {
            const wasAccepted = allEvents.slice(0, idx).some(e =>
                e.type === 'treaty_accepted' && e.treaty_id === matchingProposal.treaty_id
            );
            if (wasAccepted) bonus += 4; // betrayal after treaty
        }
    }
    return bonus;
}

const scored = events.map((e, i) => {
    const baseDrama = TYPE_DRAMA[e.type] || 0;
    const recip = reciprocityBonus(e, events, i);
    return { event: e, drama: baseDrama + recip, index: i };
}).filter(s => s.drama > 0);

scored.sort((a, b) => b.drama - a.drama);
const top = scored.slice(0, TOP_N);

console.log(`Top ${top.length} dramatic moments (game duration: ${data.elapsedMinutes} min, ${events.length} events total)\n`);
for (let i = 0; i < top.length; i++) {
    const s = top[i];
    const min = (s.event.elapsed_ms / 60000).toFixed(1);
    let summary = `[${min}m] ${s.event.type}`;
    // Build a readable summary per event type
    if (s.event.type === 'combat_kill') summary = `[${min}m] ⚔️  ${s.event.killer} killed ${s.event.victim}`;
    else if (s.event.type === 'war_declared') summary = `[${min}m] ⚔️  ${s.event.declarer} (${s.event.declarerFaction}) declares WAR on ${s.event.targetFaction}`;
    else if (s.event.type === 'treaty_accepted') summary = `[${min}m] 🤝 Treaty accepted by ${s.event.accepter}`;
    else if (s.event.type === 'law_vetoed') summary = `[${min}m] 🚫 ${s.event.president} vetoes Law #${s.event.law_id}: "${s.event.text}"`;
    else if (s.event.type === 'impeachment_initiated') summary = `[${min}m] 🔥 ${s.event.initiator} impeaches ${s.event.official}: "${s.event.reason}"`;
    else if (s.event.type === 'election_result') summary = `[${min}m] 🗳️  ${s.event.winner} wins ${s.event.office}`;
    else if (s.event.type === 'law_enacted') summary = `[${min}m] 📜 Law #${s.event.law_id} ENACTED: "${s.event.text}" (${s.event.yesVotes}y/${s.event.noVotes}n)`;
    else if (s.event.type === 'verdict_rendered') summary = `[${min}m] ⚖️  ${s.event.verdict.toUpperCase()}: ${s.event.defendant} — ${s.event.punishment}`;
    else if (s.event.type === 'bounty_claimed') summary = `[${min}m] 💰 ${s.event.claimer} collects bounty on ${s.event.target}`;
    console.log(`${(i + 1).toString().padStart(2)}. (drama=${s.drama}) ${summary}`);
}

// Save to file alongside game log
const outDir = './logs/highlights';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, basename(filepath).replace('.json', '_highlights.json'));
writeFileSync(outPath, JSON.stringify({
    sessionId: data.sessionId,
    sourceFile: basename(filepath),
    topDramatic: top.map(s => ({ drama: s.drama, event: s.event }))
}, null, 2));
console.log(`\nSaved to ${outPath}`);
