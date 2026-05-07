/**
 * Soul — the persistent identity of an Anima agent.
 *
 * Each agent has exactly one soul, stored at bots/<name>/soul.md.
 * - Read at game start (via $SOUL placeholder in the agent's prompt).
 * - Rewritten at game end (via core/souls/evolution.js, one LLM call).
 * - Locked at death: bots/<name>/_died.txt is written and soul.md is
 *   chmod-stripped of write permission. A locked soul never evolves again.
 *
 * Locked souls become legend — every future agent reads a one-line summary
 * of every locked soul as $LEGENDS, building cross-game mythology.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, 'templates', 'default_soul.md');
const BOTS_DIR = './bots';

export class Soul {
    constructor(agentName) {
        if (!agentName) throw new Error('Soul requires an agent name.');
        this.name = agentName;
        this.dir = join(BOTS_DIR, agentName);
        this.soulPath = join(this.dir, 'soul.md');
        this.diedMarkerPath = join(this.dir, '_died.txt');
    }

    /**
     * Returns true if the agent has died and their soul is locked forever.
     */
    isLocked() {
        return existsSync(this.diedMarkerPath);
    }

    /**
     * Returns true if a soul.md file exists yet.
     */
    exists() {
        return existsSync(this.soulPath);
    }

    /**
     * Read the soul. If no soul exists yet, returns null (caller should
     * call seed() to create an initial one).
     */
    read() {
        if (!this.exists()) return null;
        try {
            return readFileSync(this.soulPath, 'utf8');
        } catch (e) {
            console.warn(`[SOUL] Failed to read ${this.soulPath}: ${e.message}`);
            return null;
        }
    }

    /**
     * Create the initial soul from the default template, filling in seed
     * values. Called once when an agent first joins the world.
     *
     * @param {object} seed - { personality_seed, starting_motto, faction }
     */
    seed({ personality_seed = '', starting_motto = '', faction = 'unknown' } = {}) {
        if (this.exists()) {
            // Idempotent — never overwrite an existing soul.
            return this.read();
        }
        if (this.isLocked()) {
            // Edge case: marker exists but no soul.md. Leave alone.
            return null;
        }
        try {
            if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
            const template = readFileSync(TEMPLATE_PATH, 'utf8');
            const filled = template
                .replaceAll('{{name}}', this.name)
                .replaceAll('{{personality_seed}}', personality_seed || `(no personality seed provided for ${this.name})`)
                .replaceAll('{{starting_motto}}', starting_motto || 'I was born today.')
                .replaceAll('{{faction}}', faction)
                .replaceAll('{{date}}', new Date().toISOString().slice(0, 10));
            atomicWriteFileSync(this.soulPath, filled);
            // v0.48: also write a fast-readable faction.txt so the in-group
            // bias layer can read it without re-parsing soul markdown each
            // time. Best-effort — soul is the source of truth.
            try {
                if (faction && faction !== 'unknown') {
                    atomicWriteFileSync(join(this.dir, 'faction.txt'), String(faction).trim().toLowerCase());
                }
            } catch { /* nonfatal */ }
            return filled;
        } catch (e) {
            console.warn(`[SOUL] Failed to seed ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Overwrite the soul with new content. Errors if the soul is locked.
     *
     * v0.12: archives the PRIOR version to bots/<name>/soul_history/<ts>.md
     * before overwriting. This gives Anima TEMPORAL DEPTH — readers can
     * trace a character arc across many soul evolutions, not just see the
     * latest state. Single most important Anima output is reading a
     * recognizable character drift across games; temporal depth makes
     * that legible.
     */
    save(content) {
        if (this.isLocked()) {
            throw new Error(`Cannot save soul for ${this.name}: locked at death.`);
        }
        try {
            if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });

            // v0.12: archive the prior version (if any) before overwriting.
            // Best-effort — if archive fails, we still save the new version.
            // Timestamp includes ms; append -N counter if same-ms collision
            // would still happen (rare but possible on very fast iterations).
            const prior = this.read();
            if (prior) {
                try {
                    const histDir = join(this.dir, 'soul_history');
                    if (!existsSync(histDir)) mkdirSync(histDir, { recursive: true });
                    const baseStamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
                    let path = join(histDir, `${baseStamp}.md`);
                    let counter = 1;
                    while (existsSync(path)) {
                        path = join(histDir, `${baseStamp}-${counter}.md`);
                        counter++;
                    }
                    atomicWriteFileSync(path, prior);
                } catch (e) {
                    console.warn(`[SOUL] History archive failed for ${this.name}: ${e.message}. Continuing with save.`);
                }
            }

            atomicWriteFileSync(this.soulPath, content);
            return true;
        } catch (e) {
            console.warn(`[SOUL] Failed to save ${this.name}: ${e.message}`);
            return false;
        }
    }

    /**
     * v0.12: list past versions of this soul, oldest first. Each entry:
     *   { stamp: ISO-like string, path: absolute, content: () => string }
     * The .content() lazily reads the file so callers can iterate cheaply.
     */
    history() {
        const histDir = join(this.dir, 'soul_history');
        if (!existsSync(histDir)) return [];
        try {
            const files = readdirSync(histDir)
                .filter(f => f.endsWith('.md'))
                .sort();          // ISO timestamps sort chronologically
            return files.map(f => {
                const path = join(histDir, f);
                return {
                    stamp: f.replace(/\.md$/, ''),
                    path,
                    content: () => readFileSync(path, 'utf8')
                };
            });
        } catch (e) {
            console.warn(`[SOUL] Failed to list history for ${this.name}: ${e.message}`);
            return [];
        }
    }

    /**
     * Lock the soul forever. Writes a _died.txt marker and chmods the soul
     * file to read-only. Idempotent.
     *
     * @param {object} info - { cause, at, by } — recorded in _died.txt
     */
    lock({ cause = 'unknown', at = null, by = null, scenario = null } = {}) {
        if (this.isLocked()) return; // already locked
        try {
            if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
            const marker = [
                `Died: ${new Date().toISOString()}`,
                `Cause: ${cause}`,
                at ? `At: ${typeof at === 'object' ? JSON.stringify(at) : at}` : null,
                by ? `By: ${by}` : null,
                scenario ? `Scenario: ${scenario}` : null,
            ].filter(Boolean).join('\n') + '\n';
            atomicWriteFileSync(this.diedMarkerPath, marker);
            // Best-effort chmod read-only. On Windows this clears the write bit.
            if (this.exists()) {
                try { chmodSync(this.soulPath, 0o444); } catch { /* nonfatal on some FS */ }
            }
            console.log(`[SOUL] ${this.name} locked. Cause: ${cause}.`);

            // v0.13: append epitaph to the cross-scenario Pantheon.
            // v0.42: ANIMA_NO_PANTHEON=1 suppresses this — used by tests to
            // avoid polluting pantheon.md. Default behavior unchanged.
            if (process.env.ANIMA_NO_PANTHEON !== '1') {
                try {
                    const soulContent = this.read() || '';
                    // Dynamic import keeps this module decoupled — Soul doesn't
                    // hard-depend on pantheon, but locks contribute to it when present.
                    import('./pantheon.js').then(({ appendEpitaph }) => {
                        appendEpitaph(this.name, soulContent, { cause, at, by }, scenario);
                    }).catch(e => {
                        console.warn(`[PANTHEON] dynamic import failed: ${e.message}`);
                    });
                } catch { /* nonfatal */ }
            }
        } catch (e) {
            console.warn(`[SOUL] Failed to lock ${this.name}: ${e.message}`);
        }
    }

    /**
     * Format the soul for prompt injection. Returns a string ready to drop
     * into the $SOUL placeholder. If no soul exists, returns a brief stub.
     */
    asPromptText() {
        const content = this.read();
        if (!content) {
            return `(${this.name}'s soul has not yet been written. This is the first life.)`;
        }
        const status = this.isLocked() ? '[FROZEN — you have died; this soul cannot change]' : '[LIVING — this soul will evolve at the end of this game]';
        return `=== YOUR SOUL ${status} ===\n${content.trim()}\n=== END SOUL ===`;
    }

    /**
     * One-line summary used in $LEGENDS — the cross-agent reference list.
     * Pulls the motto and life-status from the soul.
     */
    oneLineSummary() {
        const content = this.read();
        if (!content) return `${this.name}: (no soul yet)`;
        const mottoMatch = content.match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i);
        const motto = mottoMatch ? mottoMatch[1] : '';
        const status = this.isLocked()
            ? `LEGEND (died ${this._readDeathDate()}): "${motto}"`
            : `alive: "${motto}"`;
        return `${this.name} — ${status}`;
    }

    _readDeathDate() {
        try {
            const marker = readFileSync(this.diedMarkerPath, 'utf8');
            const m = marker.match(/Died: ([^\s]+)/);
            return m ? m[1].slice(0, 10) : '?';
        } catch { return '?'; }
    }
}

/**
 * Roster helpers — for $LEGENDS cross-references and the soul_inspector script.
 */

/**
 * List all agents who have ever had a soul (alive or locked) by scanning
 * the bots/ directory for soul.md files.
 */
export function listAllSouls() {
    if (!existsSync(BOTS_DIR)) return [];
    const result = [];
    try {
        for (const entry of readdirSync(BOTS_DIR)) {
            const dir = join(BOTS_DIR, entry);
            try {
                if (!statSync(dir).isDirectory()) continue;
            } catch { continue; }
            if (existsSync(join(dir, 'soul.md'))) {
                result.push(new Soul(entry));
            }
        }
    } catch { /* nonfatal */ }
    return result;
}

/**
 * Format the roster of all souls (alive + locked) as a single string for
 * the $LEGENDS prompt placeholder. Excludes the asking agent's own line.
 */
export function rosterAsLegends(askingAgentName) {
    const all = listAllSouls();
    if (all.length === 0) return '';
    const lines = all
        .filter(s => s.name !== askingAgentName)
        .map(s => '- ' + s.oneLineSummary());
    if (lines.length === 0) return '';
    return '=== LEGENDS — those you have known or heard of ===\n' + lines.join('\n') + '\n=== END LEGENDS ===';
}
