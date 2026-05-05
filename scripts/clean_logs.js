#!/usr/bin/env node
/**
 * Clean Logs (v10) — wipe local game/agent state for a clean run.
 * Useful before a tournament or to reset accumulated noise.
 *
 * Usage: npm run clean-logs            # wipe bots/ + logs/games + logs/narratives
 *        npm run clean-logs -- --all   # also wipe logs/governance + logs/sessions
 *        npm run clean-logs -- --keep-summaries   # preserve post-game summaries
 */

import { rmSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const KEEP_SUMMARIES = args.includes('--keep-summaries');

function clearDir(dir, predicate = null) {
    if (!existsSync(dir)) {
        console.log(`  (skipped, doesn't exist) ${dir}`);
        return 0;
    }
    let removed = 0;
    for (const entry of readdirSync(dir)) {
        if (predicate && !predicate(entry)) continue;
        const full = join(dir, entry);
        try {
            rmSync(full, { recursive: true, force: true });
            removed++;
        } catch (e) {
            console.warn(`    failed to remove ${full}: ${e.message}`);
        }
    }
    console.log(`  removed ${removed} entries from ${dir}`);
    return removed;
}

console.log('Cleaning logs...');

// Always: per-bot agent state
clearDir('./bots', e => e !== 'execTemplate.js' && e !== 'lintTemplate.js');

// Always: game logs and narratives (those are per-session)
clearDir('./logs/games');
clearDir('./logs/narratives', e => {
    if (KEEP_SUMMARIES && e.endsWith('_summary.md')) return false;
    return true;
});
clearDir('./logs/highlights');
clearDir('./logs/videos');
clearDir('./logs/budget');

// Optional: cross-session state (governance state file, session journal)
if (ALL) {
    clearDir('./logs/governance');
    clearDir('./logs/sessions');
    console.log('Wiped cross-session state (use this for a true clean slate).');
} else {
    console.log('Kept logs/governance and logs/sessions (use --all to clear those too).');
}

console.log('\nDone. Ready for a clean run.');
