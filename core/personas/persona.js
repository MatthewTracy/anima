/**
 * Persona masks — agents can adopt a different identity temporarily.
 *
 * Until v0.26, identity in Anima was fixed: an agent IS their soul.
 * The Burden primitive shipped hidden state but didn't allow ACTIVE
 * lying about identity. Persona masks fill that gap: an agent can
 * say "I am not Fox, I am Brother Bartholomew" and other agents
 * see the mask, not the real name.
 *
 * Stored at bots/<name>/persona.json. While a persona is active:
 *   - The agent's $LEGENDS line uses the persona name to others
 *   - Event logs continue to use the real name (the simulation knows)
 *   - Other agents reading the agent's prompts see the persona
 *
 * Reveal: when a mask DROPS (the agent stops wearing it) or is
 * EXPOSED (some scenario action reveals the truth), the soul gets
 * a "I learned to lie about who I am" scar at next evolution.
 *
 * STATUS (v0.26): data layer + reveal/expose API. Scenarios that want
 * persona-aware $LEGENDS can read this layer; default $LEGENDS is
 * unchanged (uses real names). Adoption is per-scenario.
 *
 * Why this matters: spies, confidence men, and undercover agents all
 * become possible. Identity is normally fixed; Anima now makes it
 * performative.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getStress, stressLevel } from '../cognition/allostatic_load.js';

const BOTS_DIR = './bots';

export class Persona {
    constructor(agentName) {
        if (!agentName) throw new Error('Persona requires an agent name.');
        this.name = agentName;
        this.dir = join(BOTS_DIR, agentName);
        this.path = join(this.dir, 'persona.json');
        this.historyPath = join(this.dir, 'persona_history.json');
    }

    /**
     * Returns true if a mask is currently active.
     */
    isWearingMask() {
        return existsSync(this.path);
    }

    /**
     * Read the active persona record, or null.
     */
    read() {
        if (!this.isWearingMask()) return null;
        try {
            return JSON.parse(readFileSync(this.path, 'utf8'));
        } catch (e) {
            console.warn(`[PERSONA] Failed to read ${this.path}: ${e.message}`);
            return null;
        }
    }

    /**
     * Adopt a mask. Overwrites any prior active persona.
     *
     * @param {object} args
     * @param {string} args.alias - the name presented to others
     * @param {string} [args.bio] - one-line claimed background
     * @param {string} [args.motive] - why you wear this mask (own use)
     */
    adopt({ alias, bio = '', motive = '' }) {
        if (!alias) throw new Error('Persona.adopt requires an alias.');
        try {
            if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
            const record = {
                version: 1,
                bearer: this.name,
                alias: alias.trim(),
                bio: bio.trim().slice(0, 500),
                motive: motive.trim().slice(0, 500),
                adoptedAt: new Date().toISOString()
            };
            writeFileSync(this.path, JSON.stringify(record, null, 2));
            return record;
        } catch (e) {
            console.warn(`[PERSONA] Failed to adopt for ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Drop the mask voluntarily. Records a 'dropped' history entry.
     */
    drop() {
        const active = this.read();
        if (!active) return null;
        try {
            const history = this._readHistory();
            history.push({ ...active, droppedAt: new Date().toISOString(), exposed: false });
            this._saveHistory(history);
            unlinkSync(this.path);
            return { ...active, dropped: true };
        } catch (e) {
            console.warn(`[PERSONA] Failed to drop for ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Expose the mask — someone else figured it out. Records an
     * 'exposed' history entry. The reveal happens whether the
     * bearer wanted it to or not.
     *
     * @param {string} byWhom - who exposed the mask
     * @param {string} [context]
     */
    expose(byWhom, context = '') {
        const active = this.read();
        if (!active) return null;
        try {
            const history = this._readHistory();
            history.push({
                ...active,
                exposedAt: new Date().toISOString(),
                exposed: true,
                exposedBy: byWhom,
                context: context.slice(0, 300)
            });
            this._saveHistory(history);
            unlinkSync(this.path);
            return { ...active, exposed: true, exposedBy: byWhom };
        } catch (e) {
            console.warn(`[PERSONA] Failed to expose for ${this.name}: ${e.message}`);
            return null;
        }
    }

    /**
     * Read history of all past masks (dropped + exposed).
     */
    history() {
        return this._readHistory();
    }

    _readHistory() {
        if (!existsSync(this.historyPath)) return [];
        try { return JSON.parse(readFileSync(this.historyPath, 'utf8')); }
        catch { return []; }
    }
    _saveHistory(arr) {
        if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
        writeFileSync(this.historyPath, JSON.stringify(arr, null, 2));
    }

    /**
     * What the bearer should see in their prompt about their own mask.
     * (Bearer only — others see only the mask name via separate API.)
     *
     * v0.79: under acute allostatic load (Goffman 1959 on the
     * "performance"; clinical literature on stress + facade collapse),
     * social masks are expensive to maintain. The bearer's prompt now
     * reads a slipping warning when they are allostatic or overloaded —
     * cuing the LLM to let some real voice through, or to lean harder
     * on the mask at visible cost.
     */
    asPromptText() {
        const a = this.read();
        if (!a) return '';
        const motive = a.motive ? ` Your motive: ${a.motive}.` : '';
        const level = stressLevel(getStress(this.name));
        let stressNote = '';
        if (level === 'overloaded') {
            stressNote = `\n[YOUR MASK IS SLIPPING] You are too tired to keep ${a.alias} airtight right now. The real ${this.name} keeps surfacing — in word choice, in posture, in what you almost say before catching yourself. Either let something true through or pay the cost of holding the line.`;
        } else if (level === 'allostatic') {
            stressNote = `\n[YOUR MASK IS HEAVIER] Maintaining ${a.alias} requires more effort than usual. You can still hold it, but the seams are visible to someone paying attention.`;
        }
        return `=== YOUR ACTIVE MASK — only you know you wear it ===
You present yourself to others as "${a.alias}".${a.bio ? ` Your claimed bio: ${a.bio}.` : ''}${motive}
Others see "${a.alias}" in chat and rosters. The simulation knows you are ${this.name}.${stressNote}
=== END MASK ===`;
    }
}

/**
 * Resolve display name for a target. If the target is wearing a mask,
 * return the mask's alias. Otherwise, return the target's real name.
 *
 * Used by scenario runners that want persona-aware UI / $LEGENDS.
 */
export function resolveDisplayName(targetName) {
    const p = new Persona(targetName);
    const active = p.read();
    return active ? active.alias : targetName;
}
