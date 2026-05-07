/**
 * Burden — hidden per-agent state.
 *
 * Each agent can carry a private burden — a secret, a sin, a prophecy,
 * a debt, an illness — that only THEY see in their prompts. Other agents
 * have no view of it. This is the missing axis after nine iterations of
 * visible-state primitives: **what the agent privately carries**.
 *
 * No prior multi-agent LLM framework ships hidden information as a
 * first-class primitive. Stanford's Generative Agents had public state
 * only. AutoGen treats agents as functions. Anima's burdens give each
 * agent something true that the others must INFER, never directly read.
 *
 * Storage: bots/<name>/burden.json. Persists across runs by default.
 * Call Burden.clear(name) to reset between games when scenarios want
 * fresh secrets per run.
 *
 * Privacy: $BURDEN placeholder substitutes ONLY when the prompt is for
 * the carrier — never into shared prompts. Storage is per-agent so
 * cross-agent reads are explicit and auditable.
 *
 * Reveal patterns:
 *   - Memoirs may reveal it (LLM choice)
 *   - Soul evolution may incorporate it into "My scars" or "What I have learned"
 *   - The agent can confess it in dialogue (and from then on it's leaked)
 *   - Death may not reveal it — it goes into the Pantheon only if the
 *     evolved soul kept a trace before locking
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';
import { join } from 'path';

const BOTS_DIR = './bots';

export class Burden {
    /**
     * @param {string} agentName - the bearer of the burden
     */
    constructor(agentName) {
        if (!agentName) throw new Error('Burden requires an agent name.');
        this.name = agentName;
        this.dir = join(BOTS_DIR, agentName);
        this.path = join(this.dir, 'burden.json');
    }

    /**
     * Returns true if a burden is currently set for this agent.
     */
    exists() {
        return existsSync(this.path);
    }

    /**
     * Read the burden. Returns null if none set.
     */
    read() {
        if (!this.exists()) return null;
        try {
            return JSON.parse(readFileSync(this.path, 'utf8'));
        } catch (e) {
            console.warn(`[BURDEN] Failed to read ${this.path}: ${e.message}`);
            return null;
        }
    }

    /**
     * Assign a burden. Overwrites any existing one (the new burden
     * replaces the old; some scenarios cycle burdens between games).
     *
     * @param {object} args
     * @param {string} args.text   - the burden text in first person ("I caused...")
     * @param {string} [args.kind] - sin / secret / prophecy / debt / curse / illness
     * @param {string} [args.source] - scenario or seeder of the burden
     */
    assign({ text, kind = 'secret', source = null }) {
        if (!text) throw new Error('Burden.assign requires text.');
        try {
            if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
            const record = {
                version: 1,
                bearer: this.name,
                text: text.trim(),
                kind,
                source,
                assignedAt: new Date().toISOString()
            };
            atomicWriteFileSync(this.path, JSON.stringify(record, null, 2));
            return record;
        } catch (e) {
            console.warn(`[BURDEN] Failed to assign for ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Remove the burden. Used when a scenario wants fresh burdens
     * between games or when a confession publicly reveals it (the
     * burden being known stops being a hidden burden).
     */
    clear() {
        if (!this.exists()) return;
        try {
            unlinkSync(this.path);
        } catch (e) {
            console.warn(`[BURDEN] Failed to clear for ${this.name}: ${e.message}`);
        }
    }

    /**
     * v0.22: confession — the bearer publicly reveals their burden.
     * Returns the burden record (so callers can broadcast / log it),
     * marks it as confessed in a persistent record at bots/<name>/confessed.json
     * so soul evolution can read it as a "What I have learned" candidate,
     * then clears the active burden (it is no longer hidden).
     *
     * Future agents reading this agent's history will see the confession
     * as a finished chapter rather than an unspoken sin.
     *
     * @param {object} [opts]
     * @param {string} [opts.toAudience] - 'public' (default), 'private', or a specific name
     * @param {string} [opts.context] - free-form context for memoir/soul
     * @returns {object|null} the burden record + confession metadata, or null if no burden
     */
    confess({ toAudience = 'public', context = '' } = {}) {
        const b = this.read();
        if (!b) return null;
        try {
            // Append to a confessed-history file the bearer's soul evolution can read
            const confessedPath = join(this.dir, 'confessed.json');
            let history = [];
            if (existsSync(confessedPath)) {
                try { history = JSON.parse(readFileSync(confessedPath, 'utf8')); } catch { /* fresh */ }
            }
            const record = {
                ...b,
                confessedAt: new Date().toISOString(),
                toAudience,
                context: (context || '').slice(0, 500)
            };
            history.push(record);
            atomicWriteFileSync(confessedPath, JSON.stringify(history, null, 2));

            // Clear the active burden — it is no longer hidden
            this.clear();

            return record;
        } catch (e) {
            console.warn(`[BURDEN] Failed to confess for ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Read the bearer's confession history (zero or more past confessions).
     * Used by soul evolution to fold confessed burdens into "What I have learned."
     */
    confessions() {
        const path = join(this.dir, 'confessed.json');
        if (!existsSync(path)) return [];
        try { return JSON.parse(readFileSync(path, 'utf8')); }
        catch { return []; }
    }

    /**
     * Format for $BURDEN prompt placeholder. ONLY include the burden in
     * prompts for the carrier — caller must guarantee this is not
     * substituted into shared/cross-agent prompts.
     */
    asPromptText() {
        const b = this.read();
        if (!b) return ''; // Empty placeholder when no burden — agents who don't carry one see nothing
        const kindLine = b.kind ? ` [${b.kind.toUpperCase()}]` : '';
        return `=== YOUR PRIVATE BURDEN${kindLine} — only you know this ===
${b.text}
This burden affects how you read every situation. The others do not know. Whether to confess, hide, or let it shape you in silence is your call.
=== END BURDEN ===`;
    }
}

/**
 * Module-level helpers for scenario authors.
 */

/**
 * Assign a random burden to an agent from a bank. Useful at scenario
 * start — pick a bank that fits the world.
 *
 * @param {string} agentName
 * @param {string[]|object[]} bank — array of strings or {text, kind} objects
 * @param {object} [opts]
 * @param {string} [opts.source] — recorded with the burden
 * @returns {object} the assigned burden record
 */
export function assignRandomFromBank(agentName, bank, opts = {}) {
    if (!Array.isArray(bank) || bank.length === 0) return null;
    const pick = bank[Math.floor(Math.random() * bank.length)];
    const { text, kind = 'secret' } = typeof pick === 'string' ? { text: pick } : pick;
    return new Burden(agentName).assign({ text, kind, source: opts.source });
}

/**
 * Clear all burdens for a roster — call at game start if a scenario
 * wants fresh secrets per run rather than carryover.
 */
export function clearBurdens(roster) {
    for (const name of roster || []) {
        new Burden(name).clear();
    }
}
