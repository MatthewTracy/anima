/**
 * FeudTracker — cross-scenario cross-game antagonism graph.
 *
 * The substrate has cross-game memory of who you ARE (souls), who came
 * BEFORE you (lineage), and who DIED (pantheon). But until v0.18 it had
 * no memory of who has WRONGED you. This module fills that gap.
 *
 * Every time agent A does something antagonistic to agent B (attack,
 * excommunicate, vent, flog, accuse, break a commitment), the edge from
 * A→B increases by a weight specific to the act. The graph persists
 * in logs/feuds.json across all games and scenarios.
 *
 * After 30 games where Chaos has killed Madison three times, vented
 * Hamilton once, and accused Paine publicly twice, Madison walks into
 * game 31 with "Chaos: 3 unresolved antagonisms" in her prompt. That's
 * the missing dimension between 'I am' and 'they died' — what was done
 * to me, and to my kin, that I have not yet answered.
 *
 * No prior multi-agent LLM framework tracks cross-game antagonisms as
 * first-class state.
 */

import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../runtime/atomic_io.js';

const FEUDS_PATH = './logs/feuds.json';
const RECENT_DISPLAY_CAP = 5;            // most recent entries shown per edge in $FEUDS

/**
 * Per-event antagonism weights. Higher = more grievous.
 * Pulled to match (and slightly extend) the auto_update delta table.
 */
export const ANTAGONISM_WEIGHTS = Object.freeze({
    attack_player:    2,
    kill_player:      6,
    vent:             5,        // killed by depressurization
    excommunicate:    4,        // exiled from the order
    expel:            4,        // exiled from the cell
    flog:             1,
    brig:             1,
    accuse:           1,        // public accusation of sin
    mutiny_call:      1,        // (against the captain)
    mutiny_succeed:   3,        // captaincy stripped
    contain_fail:     0,        // not antagonistic — environmental
    commitment_broken: 2,       // broken promise
    raid:             2,
    sabotage:         2
});

/**
 * Static set of event types we treat as antagonistic.
 */
export const ANTAGONISTIC_EVENT_TYPES = new Set(Object.keys(ANTAGONISM_WEIGHTS).filter(k => ANTAGONISM_WEIGHTS[k] > 0));

export class FeudTracker {
    constructor(path = FEUDS_PATH) {
        this.path = path;
        this._cache = null;
    }

    _load() {
        if (this._cache) return this._cache;
        if (!existsSync(this.path)) {
            this._cache = { version: 1, edges: {} };
            return this._cache;
        }
        try {
            this._cache = JSON.parse(readFileSync(this.path, 'utf8'));
            if (!this._cache.edges) this._cache.edges = {};
            return this._cache;
        } catch (e) {
            console.warn(`[FEUDS] Failed to load ${this.path}: ${e.message}. Starting fresh.`);
            this._cache = { version: 1, edges: {} };
            return this._cache;
        }
    }

    _save() {
        if (!this._cache) return;
        try {
            atomicWriteFileSync(this.path, JSON.stringify(this._cache, null, 2));
        } catch (e) {
            console.warn(`[FEUDS] Failed to save ${this.path}: ${e.message}`);
        }
    }

    /**
     * Record an antagonism. Edge keyed as `${actor}→${target}`.
     */
    record(actor, target, eventType, scenario) {
        if (!actor || !target || actor === target) return;
        const weight = ANTAGONISM_WEIGHTS[eventType];
        if (!weight || weight <= 0) return;

        const data = this._load();
        const key = `${actor}→${target}`;
        if (!data.edges[key]) {
            data.edges[key] = {
                actor,
                target,
                total_weight: 0,
                count: 0,
                entries: []
            };
        }
        const edge = data.edges[key];
        edge.total_weight += weight;
        edge.count += 1;
        edge.entries.push({
            type: eventType,
            weight,
            scenario: scenario || 'unknown',
            at: new Date().toISOString()
        });
        // Keep only the most recent entries to avoid unbounded growth
        if (edge.entries.length > 20) {
            edge.entries.splice(0, edge.entries.length - 20);
        }
        this._save();
    }

    /**
     * Get one edge's data (or null if no antagonisms in that direction).
     */
    edge(actor, target) {
        const data = this._load();
        return data.edges[`${actor}→${target}`] || null;
    }

    /**
     * Top N rivals AGAINST the given agent (people who have wronged them most).
     * Sorted by total_weight descending.
     */
    topAggressorsAgainst(name, n = 5) {
        const data = this._load();
        const inEdges = Object.values(data.edges)
            .filter(e => e.target === name)
            .sort((a, b) => b.total_weight - a.total_weight);
        return inEdges.slice(0, n);
    }

    /**
     * Top N rivals OF the given agent (people they have wronged most).
     */
    topVictimsOf(name, n = 5) {
        const data = this._load();
        const outEdges = Object.values(data.edges)
            .filter(e => e.actor === name)
            .sort((a, b) => b.total_weight - a.total_weight);
        return outEdges.slice(0, n);
    }

    /**
     * Format for the $FEUDS prompt placeholder. Shows what was DONE TO this
     * agent (their grievances) and what they have DONE (their reputation).
     */
    asPromptText(askingAgent) {
        const grievances = this.topAggressorsAgainst(askingAgent, 5);
        const reputation = this.topVictimsOf(askingAgent, 5);

        if (grievances.length === 0 && reputation.length === 0) {
            return `=== YOUR FEUDS ===\n(No unresolved antagonisms across past games. You walk in clean.)\n=== END FEUDS ===`;
        }

        const lines = ['=== YOUR FEUDS — what is between you and the others, across all your games ==='];

        if (grievances.length > 0) {
            lines.push('');
            lines.push('What was DONE TO YOU:');
            for (const e of grievances) {
                const recent = e.entries.slice(-RECENT_DISPLAY_CAP);
                const summary = recent.map(en => `${en.type}@${en.scenario}`).join(', ');
                lines.push(`  - ${e.actor}: ${e.count} antagonism${e.count === 1 ? '' : 's'} (weight ${e.total_weight}) — ${summary}`);
            }
        }
        if (reputation.length > 0) {
            lines.push('');
            lines.push('What YOU have done (others remember):');
            for (const e of reputation) {
                const recent = e.entries.slice(-RECENT_DISPLAY_CAP);
                const summary = recent.map(en => `${en.type}@${en.scenario}`).join(', ');
                lines.push(`  - to ${e.target}: ${e.count} antagonism${e.count === 1 ? '' : 's'} (weight ${e.total_weight}) — ${summary}`);
            }
        }
        lines.push('=== END FEUDS ===');
        return lines.join('\n');
    }

    /**
     * Return a flat list of all edges (for inspector scripts).
     */
    allEdges() {
        const data = this._load();
        return Object.values(data.edges).sort((a, b) => b.total_weight - a.total_weight);
    }
}

/**
 * Module-level convenience: log antagonism from an event object. Used by
 * auto_update.js and any scenario runner that wants direct integration.
 *
 * @param {object} event - { type, actor, target, scenario? }
 */
export function logEventAsFeud(event) {
    if (!event || !event.actor || !event.target) return false;
    if (!ANTAGONISTIC_EVENT_TYPES.has(event.type)) return false;
    new FeudTracker().record(event.actor, event.target, event.type, event.scenario);
    return true;
}
