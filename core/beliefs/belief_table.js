/**
 * BeliefTable — per-agent theory of mind.
 *
 * For agent A, this is a table mapping every OTHER agent → A's belief
 * about them: trust score (-1 to +1), last evidence, last update time.
 *
 * Beliefs persist per-agent at bots/<name>/beliefs.json. They compose with
 * souls: at game end, the soul evolution prompt can read this agent's
 * beliefs and incorporate them into the "Who I trust / fear / owe" sections.
 * Without beliefs, soul evolution has to reconstruct trust from raw events
 * every time. With beliefs, trust accumulates as a numerical force.
 *
 * Status (v0.6): ships as the data structure + prompt-injection layer.
 * Mechanical updates from witness events: deferred to v0.7.
 * LLM-driven belief revision: deferred to v0.8.
 *
 * Trust scale: -1.0 (sworn enemy) → 0.0 (unknown / neutral) → +1.0 (sworn ally).
 * Suggested deltas:
 *   +0.20  fulfilled a promise / shared a resource
 *   +0.10  voted with you, defended you in chat
 *   -0.10  ignored a request, voted against you
 *   -0.20  caught in a lie, broke a commitment
 *   -0.40  attacked you, accused you publicly without evidence
 *
 * Cross-process note: in scenarios where agents run as separate processes
 * (Forum), each agent owns ITS OWN belief table on disk. The single source
 * of truth is the file. There is no cross-process sync — that's intentional.
 * Beliefs are private mental state; they're not meant to be shared.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getStress, stressLevel } from '../cognition/allostatic_load.js';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';

const BOTS_DIR = './bots';
const TRUST_MIN = -1.0;
const TRUST_MAX = 1.0;
const MAX_EVIDENCE_ENTRIES = 6;     // per target — keep recent only
const EVIDENCE_TEXT_MAX = 120;      // chars per evidence line

// v0.67: Miller's 7±2 cap. The prompt-visible belief list shows only the
// most-charged (|trust|-ranked) relationships; the rest become a one-line
// "background" footer so the LLM knows there are weaker ties without
// reading them. Mirrors how working memory privileges the loudest signals.
//
// v0.73: stress-induced narrowing (Easterbrook 1959; Kahneman 1973). Under
// high allostatic load, working-memory capacity contracts — peripheral
// relationships fall out of attention as the nervous system narrows onto
// the loudest threat-relevant signals. The cap shrinks with load:
//   baseline (load < 0.35)   → 9 active beliefs
//   elevated (< 0.55)        → 7 active
//   allostatic (< 0.7)       → 5 active
//   overloaded (≥ 0.7)       → 3 active
const ACTIVE_BELIEFS_CAP_BASELINE   = 9;
const ACTIVE_BELIEFS_CAP_ELEVATED   = 7;
const ACTIVE_BELIEFS_CAP_ALLOSTATIC = 5;
const ACTIVE_BELIEFS_CAP_OVERLOADED = 3;

export class BeliefTable {
    /**
     * @param {string} owner - the agent whose mind this is (the believer)
     */
    constructor(owner) {
        if (!owner) throw new Error('BeliefTable requires an owner agent name.');
        this.owner = owner;
        this.dir = join(BOTS_DIR, owner);
        this.path = join(this.dir, 'beliefs.json');
        this._cache = null;
    }

    /**
     * Load the table from disk. Returns the parsed object or an empty
     * structure if the file doesn't exist yet.
     *
     * Schema:
     *   { version: 1, owner: <name>, targets: { <name>: { trust, lastUpdate, evidence: [{at, delta, reason}] } } }
     */
    _load() {
        if (this._cache) return this._cache;
        if (!existsSync(this.path)) {
            this._cache = { version: 1, owner: this.owner, targets: {} };
            return this._cache;
        }
        try {
            this._cache = JSON.parse(readFileSync(this.path, 'utf8'));
            if (!this._cache.targets) this._cache.targets = {};
            return this._cache;
        } catch (e) {
            console.warn(`[BELIEFS] Failed to load ${this.path}: ${e.message}. Starting fresh.`);
            this._cache = { version: 1, owner: this.owner, targets: {} };
            return this._cache;
        }
    }

    _save() {
        if (!this._cache) return;
        try {
            // v1.1.6: atomic write — same crash-durability rationale as
            // AffectLog. BeliefTable rewrites this file on every update()
            // and set(), so a crash mid-write would corrupt the JSON and
            // the next _load silently resets the witness's beliefs.
            atomicWriteFileSync(this.path, JSON.stringify(this._cache, null, 2));
        } catch (e) {
            console.warn(`[BELIEFS] Failed to save ${this.path}: ${e.message}`);
        }
    }

    /**
     * Read the believer's view of one target. Returns the entry or a
     * neutral default if the target hasn't been observed yet.
     */
    get(target) {
        if (!target || target === this.owner) return null;
        const data = this._load();
        return data.targets[target] || { trust: 0, lastUpdate: null, evidence: [] };
    }

    /**
     * Adjust trust for a target by `delta`, recording a one-line reason.
     * Trust is clamped to [-1, +1]. Evidence is kept FIFO at MAX_EVIDENCE_ENTRIES.
     */
    update(target, delta, reason) {
        if (!target) return;
        if (target === this.owner) return;     // can't have beliefs about yourself
        if (typeof delta !== 'number' || Number.isNaN(delta)) return;

        const data = this._load();
        if (!data.targets[target]) {
            data.targets[target] = { trust: 0, lastUpdate: null, evidence: [] };
        }
        const entry = data.targets[target];
        entry.trust = Math.max(TRUST_MIN, Math.min(TRUST_MAX, entry.trust + delta));
        entry.lastUpdate = new Date().toISOString();
        entry.evidence.push({
            at: entry.lastUpdate,
            delta: Math.round(delta * 1000) / 1000,
            reason: (reason || '').slice(0, EVIDENCE_TEXT_MAX)
        });
        if (entry.evidence.length > MAX_EVIDENCE_ENTRIES) {
            entry.evidence.splice(0, entry.evidence.length - MAX_EVIDENCE_ENTRIES);
        }
        this._save();
    }

    /**
     * Set trust to a specific value (e.g. resetting on betrayal). Records
     * the absolute set as evidence so the audit trail stays honest.
     */
    set(target, trust, reason) {
        if (!target || target === this.owner) return;
        const clamped = Math.max(TRUST_MIN, Math.min(TRUST_MAX, trust));
        const data = this._load();
        const before = data.targets[target]?.trust ?? 0;
        if (!data.targets[target]) {
            data.targets[target] = { trust: 0, lastUpdate: null, evidence: [] };
        }
        const entry = data.targets[target];
        entry.trust = clamped;
        entry.lastUpdate = new Date().toISOString();
        entry.evidence.push({
            at: entry.lastUpdate,
            delta: Math.round((clamped - before) * 1000) / 1000,
            reason: `[SET] ${reason || ''}`.slice(0, EVIDENCE_TEXT_MAX)
        });
        if (entry.evidence.length > MAX_EVIDENCE_ENTRIES) {
            entry.evidence.splice(0, entry.evidence.length - MAX_EVIDENCE_ENTRIES);
        }
        this._save();
    }

    /**
     * Return all known targets ordered by trust descending — useful for
     * "your strongest allies" / "your worst enemies" prompt formatting.
     */
    rankedTargets() {
        const data = this._load();
        return Object.entries(data.targets)
            .map(([name, entry]) => ({ name, ...entry }))
            .sort((a, b) => b.trust - a.trust);
    }

    /**
     * Format the table for prompt injection ($BELIEFS placeholder).
     * Returns a compact string the agent reads at every prompt cycle.
     *
     * v0.67: Miller's 7±2 working-memory cap. We sort by |trust| descending
     * (loudest signals first) and render the top cap. The rest become a
     * one-line "background" footer so the LLM knows they exist.
     *
     * v0.73: cap shrinks under allostatic load (Easterbrook 1959). When
     * overloaded, only the 3 loudest signals remain visible — your
     * narrowed nervous system has dropped the peripherals. A header
     * note flags this so the LLM understands the contraction is real,
     * not a coincidence.
     */
    asPromptText() {
        const ranked = this.rankedTargets();
        if (ranked.length === 0) {
            return `=== YOUR BELIEFS ===\n(No beliefs yet — you have not formed an opinion of anyone you have met.)\n=== END BELIEFS ===`;
        }
        const level = stressLevel(getStress(this.owner));
        const cap = level === 'overloaded' ? ACTIVE_BELIEFS_CAP_OVERLOADED
                  : level === 'allostatic' ? ACTIVE_BELIEFS_CAP_ALLOSTATIC
                  : level === 'elevated'   ? ACTIVE_BELIEFS_CAP_ELEVATED
                  : ACTIVE_BELIEFS_CAP_BASELINE;
        const byChargeDesc = ranked.slice().sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust));
        const active = byChargeDesc.slice(0, cap);
        const backgrounded = byChargeDesc.slice(cap);

        const lines = ['=== YOUR BELIEFS — your private read on the others ==='];
        if (level === 'overloaded' || level === 'allostatic') {
            lines.push(`(${level} load — your attention has narrowed to only the loudest signals)`);
        }
        for (const t of active) {
            const label = _trustLabel(t.trust);
            const trustStr = t.trust > 0 ? `+${t.trust.toFixed(2)}` : t.trust.toFixed(2);
            const recent = t.evidence.length > 0
                ? ` — recent: "${t.evidence[t.evidence.length - 1].reason}"`
                : '';
            lines.push(`- ${t.name}: ${label} (trust ${trustStr})${recent}`);
        }
        if (backgrounded.length > 0) {
            const names = backgrounded.map(t => t.name).join(', ');
            lines.push(`(also in your awareness, but not loud right now: ${names})`);
        }
        lines.push('=== END BELIEFS ===');
        return lines.join('\n');
    }

    /**
     * Bulk reset — typically called between scenarios so beliefs from a
     * Forum game don't leak into a Cloister game with a different cast.
     * Use carefully; this destroys evidence.
     */
    clear() {
        this._cache = { version: 1, owner: this.owner, targets: {} };
        this._save();
    }
}

function _trustLabel(trust) {
    if (trust >= 0.7) return 'TRUSTED ally';
    if (trust >= 0.3) return 'reliable';
    if (trust >= 0.05) return 'cordial';
    if (trust > -0.05) return 'unknown';
    if (trust > -0.3) return 'wary';
    if (trust > -0.7) return 'distrusted';
    return 'ENEMY';
}
