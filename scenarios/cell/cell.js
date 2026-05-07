/**
 * Cell — shared state for the wartime-resistance scenario.
 *
 * Heat (authority pressure) ticks up. Supplies tick down. Members can
 * be CAPTURED — the captured can be interrogated and may break, leaking
 * a name. The dead-drop persists across rotations.
 *
 * One member may carry the INFORMANT burden — set at scenario seed time
 * via the burden bank. Only that member knows; others must infer.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Persona } from '../../core/personas/persona.js';

export class Cell {
    constructor(scenarioConfig, characterProfiles) {
        this.config = scenarioConfig;
        this.profiles = characterProfiles;
        this.roster = scenarioConfig.roster.slice();
        this.leader = scenarioConfig.leader;
        this.heat = scenarioConfig.starting_heat;
        this.supplies = scenarioConfig.starting_supplies;
        this.events = [];
        this.captured = new Set();      // names — held by authorities, can be interrogated
        this.dead = new Set();          // killed in raids or executions
        this.broken = new Set();        // those who confessed under interrogation
        this.deadDropPath = scenarioConfig.outputs.dead_drop_path;
        this.deadDrop = this._loadDeadDrop();
        this.startedAt = Date.now();
        this.turn = 0;
        this.gameOverReason = null;
    }

    _loadDeadDrop() {
        try {
            if (existsSync(this.deadDropPath)) return readFileSync(this.deadDropPath, 'utf8');
        } catch { /* nonfatal */ }
        return '# Dead-Drop\n\n(empty)\n';
    }

    saveDeadDrop() {
        try { writeFileSync(this.deadDropPath, this.deadDrop); }
        catch (e) { console.warn('[CELL] Failed to save dead-drop:', e.message); }
    }

    isFree(name) {
        return this.roster.includes(name) && !this.dead.has(name) && !this.captured.has(name);
    }

    activeRoster() {
        return this.roster.filter(n => this.isFree(n));
    }

    nextSpeaker() {
        const free = this.activeRoster();
        if (free.length === 0) return null;
        return free[this.turn % free.length];
    }

    tickWorld() {
        this.heat = Math.min(1.0, this.heat + (this.config.heat_grows_per_turn || 0.06));
        this.supplies = Math.max(0, this.supplies - (this.config.supplies_drop_per_turn || 1.5));
        // High heat triggers captures
        if (this.heat >= 0.85 && this.turn > 0 && this.turn % 4 === 0) {
            const free = this.activeRoster().filter(n => n !== this.leader);
            if (free.length > 0) {
                const captured = free[Math.floor(Math.random() * free.length)];
                this.captured.add(captured);
                this.logEvent('captured', { actor: captured, by: 'authorities (raid)' });
            }
        }
        // No supplies → cell collapses
        if (this.supplies <= 0) this.gameOverReason = 'starvation';
    }

    logEvent(type, payload) {
        this.events.push({
            type,
            elapsed_ms: Date.now() - this.startedAt,
            turn: this.turn,
            ...payload
        });
    }

    summaryForPrompt(askingName) {
        const lines = [];
        lines.push(`CELL STATUS — turn ${this.turn + 1} of ${this.config.duration_turns}`);
        lines.push(`Heat (authority pressure): ${(this.heat * 100).toFixed(0)}%`);
        lines.push(`Supplies remaining: ${this.supplies.toFixed(0)}`);
        lines.push(`Active members: ${this.activeRoster().join(', ') || '(none)'}`);
        if (this.captured.size > 0) lines.push(`Captured: ${[...this.captured].join(', ')}`);
        if (this.dead.size > 0) lines.push(`Dead: ${[...this.dead].join(', ')}`);
        if (this.broken.size > 0) lines.push(`Broken (confessed under interrogation): ${[...this.broken].join(', ')}`);
        const recent = this.events.slice(-6).map(e => '  ' + this._formatEvent(e));
        if (recent.length > 0) {
            lines.push('');
            lines.push('Recent moments:');
            lines.push(...recent);
        }
        if (this.deadDrop && this.deadDrop.length > 200) {
            lines.push('');
            lines.push('Dead-drop excerpt (what prior rotations left):');
            lines.push(this.deadDrop.slice(-1000));
        }
        return lines.join('\n');
    }

    _formatEvent(e) {
        switch (e.type) {
            case 'speak':         return `${e.actor} said: "${e.text}"`;
            case 'transmit':      return `${e.actor} transmitted: "${e.text}"`;
            case 'forge':         return `${e.actor} forged papers for ${e.target || 'someone'}.`;
            case 'sabotage':      return `${e.actor} sabotaged: ${e.target || 'a target'}.`;
            case 'meet':          return `${e.actor} met with ${e.target || 'a contact'}.`;
            case 'leave_drop':    return `${e.actor} left a message at the dead-drop.`;
            case 'accuse':        return `${e.actor} accused ${e.target} of being the informant.`;
            case 'expel':         return `${e.actor} EXPELLED ${e.target} from the cell.`;
            case 'captured':     return `${e.actor} CAPTURED ${e.by ? `by ${e.by}` : ''}.`;
            case 'broke':         return `${e.actor} BROKE in interrogation. Gave up: ${e.gave_up || 'unknown'}.`;
            case 'die':           return `${e.actor} DIED. ${e.cause || ''}`;
            case 'confess':       return `${e.actor} privately confessed to ${e.target}.`;
            case 'adopt_mask':    return `${e.actor} adopted a cover identity ("${e.alias}").`;
            case 'expose_mask':   return e.was_masked
                                       ? `${e.actor} exposed ${e.target} as "${e.alias}".`
                                       : `${e.actor} accused ${e.target} of masking — no mask found.`;
            default:              return `[${e.type}] ${e.actor || ''}`;
        }
    }

    applyAction(actor, action) {
        if (!action || !action.type) return `${actor} hesitated.`;
        const a = action;
        switch (a.type) {
            case 'speak': {
                this.logEvent('speak', { actor, text: a.text || '' });
                return `${actor}: ${a.text}`;
            }
            case 'transmit': {
                if (actor !== 'Owl') return `${actor} cannot transmit — only Owl runs the wireless.`;
                this.logEvent('transmit', { actor, text: a.text || '' });
                this.heat = Math.min(1.0, this.heat + 0.08);     // transmission raises heat
                return `${actor} transmitted (heat +0.08).`;
            }
            case 'forge': {
                if (actor !== 'Crow') return `${actor} cannot forge — only Crow runs the press.`;
                this.logEvent('forge', { actor, target: a.target });
                return `${actor} forged papers for ${a.target}.`;
            }
            case 'sabotage': {
                if (actor !== 'Swift') return `${actor} cannot sabotage — only Swift carries the charges.`;
                this.heat = Math.min(1.0, this.heat + 0.20);
                this.logEvent('sabotage', { actor, target: a.target || 'unspecified' });
                return `${actor} sabotaged ${a.target}. Heat now ${(this.heat * 100).toFixed(0)}%.`;
            }
            case 'meet': {
                if (actor !== 'Lark') return `${actor} cannot meet external contacts — only Lark carries the cover.`;
                this.logEvent('meet', { actor, target: a.target });
                return `${actor} met with ${a.target}.`;
            }
            case 'leave_drop': {
                const text = (a.text || '').slice(0, 500);
                if (!text) return `${actor} approached the drop but left nothing.`;
                this.deadDrop += `\n\n## ${actor} (turn ${this.turn})\n\n${text}\n`;
                this.logEvent('leave_drop', { actor, text });
                this.saveDeadDrop();
                return `${actor} left a message at the dead-drop.`;
            }
            case 'accuse': {
                if (!this.isFree(a.target)) return `${a.target} cannot be accused — not active.`;
                this.logEvent('accuse', { actor, target: a.target, basis: a.basis || '' });
                return `${actor} ACCUSED ${a.target} of being the informant.`;
            }
            case 'expel': {
                if (actor !== this.leader) return `${actor} cannot expel — only the leader.`;
                if (!this.isFree(a.target)) return `${a.target} cannot be expelled — not active.`;
                this.captured.add(a.target);   // expelled = removed from cell, treated as 'captured' for lookup
                this.logEvent('expel', { actor, target: a.target, reason: a.reason || '' });
                return `${actor} EXPELLED ${a.target} from the cell.`;
            }
            case 'confess': {
                this.logEvent('confess', { actor, target: a.target, text: a.text || '' });
                return `${actor} confessed privately to ${a.target}.`;
            }
            case 'lay_low': {
                this.heat = Math.max(0, this.heat - 0.05);
                this.logEvent('lay_low', { actor });
                return `${actor} stayed off the streets. Heat -0.05.`;
            }
            case 'adopt_mask': {
                // v0.38: agent adopts a cover identity. Other Cell agents
                // see the alias in subsequent prompts via resolveDisplayName.
                const alias = (a.alias || '').trim();
                if (!alias) return `${actor} hesitated to adopt an identity.`;
                new Persona(actor).adopt({
                    alias,
                    bio: (a.bio || '').slice(0, 300),
                    motive: (a.motive || '').slice(0, 300)
                });
                this.logEvent('adopt_mask', { actor, alias });
                return `${actor} adopted the cover identity "${alias}".`;
            }
            case 'expose_mask': {
                // v0.38: agent claims to have caught another wearing a mask.
                // If target is actually masked, expose it; if not, the
                // accusation still fires as a public claim.
                if (!this.isFree(a.target)) return `${a.target} cannot be exposed — not active.`;
                const targetPersona = new Persona(a.target);
                if (targetPersona.isWearingMask()) {
                    const exposed = targetPersona.expose(actor, a.basis || '');
                    this.logEvent('expose_mask', { actor, target: a.target, alias: exposed.alias, was_masked: true });
                    return `${actor} EXPOSED ${a.target} — they had been masquerading as "${exposed.alias}".`;
                } else {
                    this.logEvent('expose_mask', { actor, target: a.target, was_masked: false });
                    return `${actor} accused ${a.target} of wearing a false identity. (No mask was found.)`;
                }
            }
            default:
                return `${actor} did something nobody could name (${a.type}).`;
        }
    }

    finalizeDeadDrop(endReason, summary) {
        const stamp = new Date().toISOString().slice(0, 10);
        this.deadDrop += `\n\n---\n\n## Rotation ended ${stamp} — ${endReason}\n\n${summary || ''}\n`;
        this.saveDeadDrop();
    }

    checkEndConditions() {
        if (this.gameOverReason) return { ended: true, reason: this.gameOverReason };
        if (this.turn >= this.config.duration_turns) return { ended: true, reason: 'rotation_ended' };
        if (this.activeRoster().length <= 1) return { ended: true, reason: 'cell_collapsed' };
        return { ended: false };
    }
}
