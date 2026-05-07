/**
 * Reincarnation — locked souls can return as new agents.
 *
 * Lineage (v0.9) is GENETIC continuity: a successor inherits an ancestor's
 * locked soul as preamble. Reincarnation is SPIRITUAL continuity: a locked
 * soul gets a new body with a new name, AND remembers — possibly hazily —
 * who they were.
 *
 * Difference from Lineage:
 *   - Successor is a new person who carries family memory
 *   - Reincarnation is the SAME person in a new body
 *
 * The reincarnated agent has:
 *   - A fresh new name (e.g. 'Madison' → 'Adams')
 *   - A new soul.md that begins as a copy of the locked ancestor soul,
 *     but with a "## Past life" section noting the prior identity
 *   - A reincarnation.json record linking the new name to the dead one
 *   - Optionally: hazy memory (only the strongest trust/distrust entries
 *     from the prior soul carry through; new beliefs start fresh)
 *
 * Why this matters: drama loops. Madison dies in Game 7. In Game 8, "Adams"
 * is born — same soul (with adjustments), no relationship continuity to
 * the original cohort. Adams might recognize Hamilton and not know why.
 * Hamilton sees only Adams. The reincarnation record is canonical but
 * the IN-CHARACTER experience is uncertain memory.
 *
 * STATUS (v0.32): scaffold + API. Scenario adoption is per-scenario.
 * Default: not used. Use it when you want a soul to RETURN.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Soul } from '../souls/soul.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOTS_DIR = './bots';

/**
 * Reincarnate a locked soul as a new agent with a new name.
 *
 * @param {string} ancestorName - must have a locked soul
 * @param {string} reincarnatedName - fresh name with no prior soul
 * @param {object} [opts]
 * @param {boolean} [opts.hazy=true] - if true, only top-3 most-extreme prior
 *                                      values carry through; else full copy
 * @returns {object} { soulPath, recordPath, ancestor }
 */
export function reincarnate(ancestorName, reincarnatedName, { hazy = true } = {}) {
    if (!ancestorName || !reincarnatedName || ancestorName === reincarnatedName) {
        throw new Error('reincarnate requires distinct ancestor + reincarnated names.');
    }
    const ancestor = new Soul(ancestorName);
    if (!ancestor.exists()) {
        throw new Error(`Ancestor "${ancestorName}" has no soul.`);
    }
    if (!ancestor.isLocked()) {
        throw new Error(`Ancestor "${ancestorName}" is still alive — only the dead reincarnate.`);
    }
    const newSoul = new Soul(reincarnatedName);
    if (newSoul.exists() || newSoul.isLocked()) {
        throw new Error(`Reincarnated name "${reincarnatedName}" already has a soul.`);
    }

    const ancestorText = ancestor.read() || '';
    const motto = (ancestorText.match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i) || [])[1] || '(motto unrecorded)';

    let pastLifeBlock;
    if (hazy) {
        // Only the motto + a hint of memory. Like dreaming you knew someone.
        pastLifeBlock = `\n\n## Past life

I have been here before. I do not know how I know. There are voices I half-remember and a name that fits like a coat that has been let out.

In a life I cannot fully see, I lived as **${ancestorName}**. My motto then was: *"${motto}"*. I do not know how that life ended, but the ending sits in me like a scar I cannot find on my body.
`;
    } else {
        // Full clear memory — rare path
        pastLifeBlock = `\n\n## Past life — clear

I lived as **${ancestorName}**. I remember. The full text of who I was follows. I am not them, but I carry them.

> ${ancestorText.split('\n').join('\n> ')}
`;
    }

    // Compose new soul: same template but renamed + past-life appended
    const newSoulText = ancestorText
        .replace(new RegExp(`^# ${ancestorName}`, 'm'), `# ${reincarnatedName}`)
        + pastLifeBlock;

    // Write new soul
    const dir = join(BOTS_DIR, reincarnatedName);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const soulPath = join(dir, 'soul.md');
    writeFileSync(soulPath, newSoulText);

    // Write reincarnation record
    const recordPath = join(dir, 'reincarnation.json');
    const record = {
        version: 1,
        reincarnatedAs: reincarnatedName,
        priorIdentity: ancestorName,
        hazy,
        reincarnatedAt: new Date().toISOString()
    };
    writeFileSync(recordPath, JSON.stringify(record, null, 2));

    return { soulPath, recordPath, ancestor: ancestorName };
}

/**
 * Read the reincarnation record for an agent. Null if they were not
 * reincarnated (i.e. they are an original agent).
 */
export function reincarnationOf(name) {
    const path = join(BOTS_DIR, name, 'reincarnation.json');
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); }
    catch { return null; }
}

/**
 * Walk all reincarnations to find the agent's full chain of past lives.
 * Returns array of names oldest-first.
 */
export function pastLives(name) {
    const lives = [];
    let current = name;
    while (true) {
        const rec = reincarnationOf(current);
        if (!rec || !rec.priorIdentity) break;
        lives.unshift(rec.priorIdentity);
        current = rec.priorIdentity;
    }
    return lives;
}
