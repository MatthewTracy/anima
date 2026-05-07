/**
 * Lineage — successors that inherit from locked souls.
 *
 * When an ancestor dies (their soul.md locks via Soul.lock()), a new agent
 * can be born as their SUCCESSOR. The successor:
 *   - Has their own fresh soul.md, with their own personality_seed
 *   - Carries an "## Ancestral memory" section quoting the dead
 *   - Has a lineage.json recording { parent, lineage[], depth }
 *   - At every prompt, sees $LINEAGE — the chain backward through their
 *     ancestors, with each ancestor's motto and cause of death
 *
 * Constraint: you can only successor a LOCKED soul. The dead pass on
 * what they were; the living are still becoming.
 *
 * Why this matters: after enough games you have families, not just
 * agents. Madison → Adams → Hayes. Each successor reads their
 * ancestors and inherits the consequences of choices they didn't make.
 * No other multi-agent LLM framework produces multi-generation drama.
 *
 * Storage:
 *   bots/<successor>/soul.md       — fresh soul + ancestral memory section
 *   bots/<successor>/lineage.json  — { parent, lineage[], depth, inheritedAt }
 *
 * Cap: $LINEAGE prompt formatting shows up to 3 most-recent ancestors.
 * The full chain is preserved in lineage.json for the soul-inspector
 * and any analysis script.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Soul } from './soul.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, 'templates', 'default_soul.md');
const BOTS_DIR = './bots';
const PROMPT_LINEAGE_DEPTH = 3;

/**
 * Public API.
 */

/**
 * Create a new agent as the successor of a locked-soul ancestor.
 * Throws if the ancestor doesn't exist, isn't locked, or if the
 * successor name is already taken.
 *
 * @param {string} ancestorName — must have a locked soul
 * @param {string} successorName — fresh name with no existing soul
 * @param {object} options
 * @param {string} options.personality_seed — successor's own seed
 * @param {string} options.starting_motto — successor's own motto
 * @param {string} [options.faction]
 * @returns {object} { soulPath, lineagePath, ancestor, depth }
 */
export function createSuccessor(ancestorName, successorName, {
    personality_seed = '',
    starting_motto = '',
    faction = 'unknown'
} = {}) {
    if (!ancestorName || !successorName) {
        throw new Error('createSuccessor requires ancestorName and successorName.');
    }
    if (ancestorName === successorName) {
        throw new Error('Successor cannot have the same name as the ancestor.');
    }

    const ancestor = new Soul(ancestorName);
    if (!ancestor.exists()) {
        throw new Error(`Ancestor "${ancestorName}" has no soul to inherit.`);
    }
    if (!ancestor.isLocked()) {
        throw new Error(`Ancestor "${ancestorName}" is still alive — successors only come from the dead.`);
    }

    const successor = new Soul(successorName);
    if (successor.exists() || successor.isLocked()) {
        throw new Error(`Successor "${successorName}" already has a soul. Pick a fresh name.`);
    }

    // Build the ancestor lineage chain by walking backward.
    const ancestorChain = _readLineageFor(ancestorName);
    const newChain = [ancestorName, ...ancestorChain];
    const depth = newChain.length;

    // Read the ancestor's locked soul for the inherited prologue.
    const ancestorSoul = ancestor.read() || '';
    const ancestorMotto = _extractMotto(ancestorSoul);
    const ancestorDeath = _readDeathInfo(ancestorName);

    // Compose the successor's soul: fresh template + ancestral memory section.
    const template = readFileSync(TEMPLATE_PATH, 'utf8');
    const filledFresh = template
        .replaceAll('{{name}}', successorName)
        .replaceAll('{{personality_seed}}', personality_seed || `(no personality seed provided for ${successorName})`)
        .replaceAll('{{starting_motto}}', starting_motto || `I carry ${ancestorName}.`)
        .replaceAll('{{faction}}', faction)
        .replaceAll('{{date}}', new Date().toISOString().slice(0, 10));

    const ancestralBlock = `\n\n## Ancestral memory\n\nI am the successor of **${ancestorName}**${ancestorDeath.cause ? `, who died ${ancestorDeath.cause}` : ''}. Their motto was: "${ancestorMotto}". I carry their soul as preamble — what they learned, I begin with. What they failed to learn, I am free to surpass.\n\n> *(excerpted from ${ancestorName}'s frozen soul)*\n>\n${_quoteMarkdown(ancestorSoul.slice(0, 800))}\n`;

    // Persist successor soul.
    const dir = join(BOTS_DIR, successorName);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const soulPath = join(dir, 'soul.md');
    writeFileSync(soulPath, filledFresh + ancestralBlock);

    // Persist lineage metadata.
    const lineagePath = join(dir, 'lineage.json');
    const lineageData = {
        version: 1,
        name: successorName,
        parent: ancestorName,
        lineage: newChain,            // closest-first: [parent, grandparent, ...]
        depth,
        inheritedAt: new Date().toISOString()
    };
    writeFileSync(lineagePath, JSON.stringify(lineageData, null, 2));

    return { soulPath, lineagePath, ancestor: ancestorName, depth };
}

/**
 * Read the lineage record for an agent. Returns null if no lineage
 * (i.e. this agent has no ancestors — they are the root of their line).
 */
export function getLineage(name) {
    const path = join(BOTS_DIR, name, 'lineage.json');
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        console.warn(`[LINEAGE] Failed to read ${path}: ${e.message}`);
        return null;
    }
}

/**
 * Format the lineage chain for $LINEAGE prompt placeholder. Shows up
 * to PROMPT_LINEAGE_DEPTH most-recent ancestors with their motto and
 * cause of death.
 */
export function asPromptText(name) {
    const data = getLineage(name);
    if (!data || !data.lineage || data.lineage.length === 0) {
        return `=== YOUR LINEAGE ===\n(You are the root of your line — no ancestors carried into this life.)\n=== END LINEAGE ===`;
    }
    const visible = data.lineage.slice(0, PROMPT_LINEAGE_DEPTH);
    const lines = [`=== YOUR LINEAGE — those whose souls you carry ===`];
    lines.push(`You are ${name}, ${data.depth} generation${data.depth === 1 ? '' : 's'} deep.`);
    for (let i = 0; i < visible.length; i++) {
        const ancName = visible[i];
        const ancSoul = new Soul(ancName);
        const motto = _extractMotto(ancSoul.read() || '');
        const death = _readDeathInfo(ancName);
        const arrow = i === 0 ? 'parent' : i === 1 ? 'grandparent' : 'ancestor';
        lines.push(`  ${arrow}: ${ancName} — "${motto}"${death.cause ? ` (died ${death.cause})` : ''}`);
    }
    if (data.lineage.length > visible.length) {
        lines.push(`  ...and ${data.lineage.length - visible.length} earlier ancestor${data.lineage.length - visible.length === 1 ? '' : 's'} in the chain.`);
    }
    lines.push(`=== END LINEAGE ===`);
    return lines.join('\n');
}

/**
 * Internal: walk the lineage backward from `name` recursively. Returns
 * the chain not including `name` itself.
 */
function _readLineageFor(name) {
    const data = getLineage(name);
    if (!data || !data.lineage) return [];
    return data.lineage.slice();
}

function _extractMotto(soulText) {
    const m = soulText.match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i);
    return m ? m[1] : '(motto unrecorded)';
}

function _readDeathInfo(name) {
    const path = join(BOTS_DIR, name, '_died.txt');
    if (!existsSync(path)) return { cause: null, at: null };
    try {
        const text = readFileSync(path, 'utf8');
        const causeMatch = text.match(/Cause:\s*(.+)/);
        const atMatch = text.match(/At:\s*(.+)/);
        return {
            cause: causeMatch ? causeMatch[1].trim() : null,
            at: atMatch ? atMatch[1].trim() : null
        };
    } catch { return { cause: null, at: null }; }
}

function _quoteMarkdown(text) {
    return text.split('\n').map(line => '> ' + line).join('\n');
}
