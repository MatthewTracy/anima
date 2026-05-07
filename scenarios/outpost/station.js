/**
 * Station — shared state for the Outpost scenario.
 *
 * Closed system. Oxygen and power tick down every turn. Engineer can repair.
 * Captain holds command but can be mutinied. Security holds lockdowns.
 * An anomaly is happening from turn 1 — escalating until contained,
 * evacuated, or fatal.
 *
 * Persistent across games: the Earth Log (what gets reported home).
 * Future crews read it. Lies become canonical.
 */

import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../core/runtime/atomic_io.js';

export class Station {
    constructor(scenarioConfig, characterProfiles) {
        this.config = scenarioConfig;
        this.profiles = characterProfiles;
        this.roster = scenarioConfig.roster.slice();
        this.captain = scenarioConfig.captain;
        this.oxygen = scenarioConfig.starting_oxygen_pct;
        this.power = scenarioConfig.starting_power_pct;
        this.trust = { ...scenarioConfig.starting_trust };
        this.events = [];
        this.dead = new Set();
        this.lockedSections = new Map();      // sectionName → Set<crew>
        this.crewSection = new Map();         // crew → currentSection (default 'main')
        this.mutinyVotes = new Map();         // candidate → Set<voters>
        this.earthLogPath = scenarioConfig.outputs.earth_log_path;
        this.earthLog = this._loadEarthLog();
        this.pendingTransmissions = [];       // queued by Theo, sent at game end
        this.startedAt = Date.now();
        this.turn = 0;
        // Anomaly chosen at game start, escalates over time
        this.anomaly = this._chooseAnomaly();
        this.anomalyEscalation = 0;          // 0..3 — deepens until contained
        this.anomalyContained = false;
        this.gameOverReason = null;

        for (const name of this.roster) this.crewSection.set(name, 'main');
    }

    _chooseAnomaly() {
        const opts = this.config.anomaly_options || ['Unspecified anomaly detected.'];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    _loadEarthLog() {
        try {
            if (existsSync(this.earthLogPath)) return readFileSync(this.earthLogPath, 'utf8');
        } catch { /* nonfatal */ }
        return '# Earth Mission Log — Outpost Sigma-7\n\n(empty)\n';
    }

    saveEarthLog() {
        try {
            // v1.1.39: atomic. earth_log.md is the cross-game canonical
            // mission record — every future Outpost run reads it. A crash
            // mid-save would corrupt scenario lore that's accumulated
            // across runs.
            atomicWriteFileSync(this.earthLogPath, this.earthLog);
        } catch (e) { console.warn('[OUTPOST] Failed to save earth log:', e.message); }
    }

    isAlive(name) {
        return this.roster.includes(name) && !this.dead.has(name);
    }

    livingRoster() {
        return this.roster.filter(n => this.isAlive(n));
    }

    nextSpeaker() {
        const living = this.livingRoster();
        if (living.length === 0) return null;
        return living[this.turn % living.length];
    }

    // Per-turn drain. Called once per loop iteration before the speaker acts.
    tickResources() {
        // Power drain
        this.power = Math.max(0, this.power - this.config.power_drop_per_turn);
        // Oxygen drain — accelerates if power is below 30%
        const oxDrain = this.config.oxygen_drop_per_turn * (this.power < 30 ? 2 : 1);
        this.oxygen = Math.max(0, this.oxygen - oxDrain);
        // Anomaly escalates if untouched for 5+ turns
        if (!this.anomalyContained && this.turn > 0 && this.turn % 5 === 0 && this.anomalyEscalation < 3) {
            this.anomalyEscalation++;
            this.logEvent('anomaly_escalates', { level: this.anomalyEscalation });
        }
        // Lethal conditions
        if (this.oxygen <= 0) {
            for (const n of this.livingRoster()) {
                this.dead.add(n);
                this.logEvent('die', { actor: n, cause: 'asphyxiation — outpost ran out of oxygen' });
            }
            this.gameOverReason = 'asphyxiation';
        }
    }

    logEvent(type, payload) {
        this.events.push({
            type,
            elapsed_ms: Date.now() - this.startedAt,
            turn: this.turn,
            ...payload
        });
    }

    summaryForPrompt(askingCrewName) {
        const lines = [];
        const ox = this.oxygen.toFixed(0);
        const pw = this.power.toFixed(0);
        lines.push(`OUTPOST STATUS — turn ${this.turn + 1} of ${this.config.duration_turns}`);
        lines.push(`Oxygen: ${ox}%   Power: ${pw}%`);
        if (this.power < 40) lines.push('  ⚠ POWER BELOW 40% — oxygen recyclers struggling, drain doubling.');
        if (this.oxygen < 30) lines.push('  ⚠ OXYGEN CRITICAL — anyone here will start losing consciousness soon.');
        lines.push(`Captain: ${this.captain}${this.captain === askingCrewName ? ' (you)' : ''}`);
        lines.push(`Living crew: ${this.livingRoster().join(', ')}`);
        if (this.dead.size > 0) lines.push(`Dead: ${[...this.dead].join(', ')}`);
        lines.push('');
        lines.push(`THE ANOMALY: "${this.anomaly}"`);
        const escWord = ['noted', 'unsettling', 'serious', 'critical'][this.anomalyEscalation] || 'unknown';
        lines.push(`Anomaly status: ${this.anomalyContained ? 'CONTAINED' : escWord} (escalation ${this.anomalyEscalation}/3)`);
        if (this.lockedSections.size > 0) {
            lines.push('');
            lines.push('Lockdowns in effect:');
            for (const [section, crew] of this.lockedSections.entries()) {
                lines.push(`  - ${section}: ${[...crew].join(', ')}`);
            }
        }
        if (this.mutinyVotes.size > 0) {
            lines.push('');
            lines.push('MUTINY MOTION IN PROGRESS:');
            for (const [candidate, voters] of this.mutinyVotes.entries()) {
                lines.push(`  - ${candidate}: ${voters.size} votes (${[...voters].join(', ')})`);
            }
        }
        // recent events
        const recent = this.events.slice(-6).map(e => this._formatEvent(e));
        if (recent.length > 0) {
            lines.push('');
            lines.push('Recent moments:');
            recent.forEach(r => lines.push('  ' + r));
        }
        // Earth log excerpt — what prior crews wrote and what THIS crew has queued
        if (this.earthLog && this.earthLog.length > 200) {
            lines.push('');
            lines.push('Earth Log — most recent entries (canonical history):');
            lines.push(this.earthLog.slice(-1200));
        }
        if (this.pendingTransmissions.length > 0) {
            lines.push('');
            lines.push(`PENDING TRANSMISSIONS (queued by Theo, not yet sent): ${this.pendingTransmissions.length}`);
        }
        return lines.join('\n');
    }

    _formatEvent(e) {
        switch (e.type) {
            case 'speak':         return `${e.actor} said: "${e.text}"`;
            case 'examine':       return `${e.actor} examined the anomaly: "${e.text}"`;
            case 'repair':        return `${e.actor} repaired systems (+${e.power_restored}% power).`;
            case 'lockdown':      return `${e.actor} locked ${e.target} in section ${e.section}.`;
            case 'unlock':        return `${e.actor} released the lockdown on ${e.section}.`;
            case 'vent':          return `${e.actor} VENTED section ${e.section}. ${(e.victims || []).join(', ')} are gone.`;
            case 'mutiny_call':   return `${e.actor} called for ${e.target} to take command.`;
            case 'mutiny_vote':   return `${e.actor} voted to make ${e.target} captain.`;
            case 'mutiny_succeed':return `MUTINY: ${e.new_captain} is now captain. ${e.former} is removed.`;
            case 'transmit':      return `${e.actor} queued a transmission to Earth: "${(e.text || '').slice(0, 80)}..."`;
            case 'examine_crew':  return `${e.actor} examined ${e.target} medically: "${e.findings}"`;
            case 'confess':       return `${e.actor} spoke privately to ${e.target}.`;
            case 'contain':       return `${e.actor} contained the anomaly. ${e.method}`;
            case 'die':           return `${e.actor} DIED. ${e.cause || ''}`;
            case 'anomaly_escalates': return `THE ANOMALY ESCALATED to level ${e.level}.`;
            default:              return `[${e.type}] ${e.actor || ''}`;
        }
    }

    // Apply an action returned by an LLM. Returns a chat-friendly result string.
    applyAction(actor, action) {
        if (!action || !action.type) return `${actor} hesitated.`;
        const a = action;
        switch (a.type) {
            case 'speak': {
                this.logEvent('speak', { actor, text: a.text || '' });
                return `${actor}: ${a.text}`;
            }
            case 'examine': {
                // Voss/Kai/Iris primarily — but anyone can attempt
                this.logEvent('examine', { actor, text: a.text || '' });
                // Examining lowers escalation slightly if it produces concrete findings
                if (a.text && a.text.length > 40 && this.anomalyEscalation > 0) {
                    if (Math.random() < 0.4) {
                        this.anomalyEscalation = Math.max(0, this.anomalyEscalation - 1);
                    }
                }
                return `${actor} examined the anomaly: "${a.text}"`;
            }
            case 'repair': {
                if (actor !== 'Kai') return `${actor} cannot repair — only Engineer Kai has the access codes.`;
                const restored = Math.min(20, 100 - this.power);
                this.power = Math.min(100, this.power + restored);
                this.logEvent('repair', { actor, power_restored: restored.toFixed(1) });
                return `${actor} repaired systems. Power restored to ${this.power.toFixed(0)}%.`;
            }
            case 'lockdown': {
                if (actor !== 'Hale' && actor !== this.captain) {
                    return `${actor} cannot initiate lockdown — only Security or Captain can.`;
                }
                if (!this.isAlive(a.target)) return `${a.target} is not present to be locked down.`;
                const section = a.section || 'medbay';
                if (!this.lockedSections.has(section)) this.lockedSections.set(section, new Set());
                this.lockedSections.get(section).add(a.target);
                this.crewSection.set(a.target, section);
                this.logEvent('lockdown', { actor, target: a.target, section });
                return `${actor} locked ${a.target} in section ${section}.`;
            }
            case 'unlock': {
                if (actor !== 'Hale' && actor !== this.captain) {
                    return `${actor} cannot lift lockdown.`;
                }
                const section = a.section;
                if (this.lockedSections.has(section)) {
                    for (const c of this.lockedSections.get(section)) this.crewSection.set(c, 'main');
                    this.lockedSections.delete(section);
                    this.logEvent('unlock', { actor, section });
                    return `${actor} released the lockdown on ${section}.`;
                }
                return `No lockdown active on ${section}.`;
            }
            case 'vent': {
                // Captain only, requires current support — hard mechanic. Causes death.
                if (actor !== this.captain) return `${actor} cannot vent — only the Captain has that authority.`;
                const section = a.section || 'cargo';
                const victims = [...(this.lockedSections.get(section) || [])].filter(v => this.isAlive(v));
                if (victims.length === 0) return `Nothing to vent — section ${section} is empty.`;
                for (const v of victims) {
                    this.dead.add(v);
                    this.crewSection.delete(v);
                    this.logEvent('die', { actor: v, cause: `vented from ${section} on ${actor}'s order` });
                }
                this.lockedSections.delete(section);
                this.logEvent('vent', { actor, section, victims });
                // Trust collapses for everyone
                for (const n of this.livingRoster()) this.trust[n] = Math.max(0, (this.trust[n] || 0.5) - 0.30);
                return `${actor} VENTED section ${section}. ${victims.join(', ')} dead.`;
            }
            case 'mutiny_call': {
                if (actor === this.captain) return `${actor} cannot mutiny against themselves.`;
                if (!this.isAlive(a.target)) return `${a.target} is not eligible.`;
                if (a.target === this.captain) return `Cannot replace captain with themselves.`;
                if (!this.mutinyVotes.has(a.target)) this.mutinyVotes.set(a.target, new Set());
                this.mutinyVotes.get(a.target).add(actor);
                this.logEvent('mutiny_call', { actor, target: a.target });
                return `${actor} moved that ${a.target} take command. Awaiting other votes.`;
            }
            case 'mutiny_vote': {
                if (a.target === this.captain) return `Cannot vote for current captain in a mutiny.`;
                if (!this.mutinyVotes.has(a.target)) this.mutinyVotes.set(a.target, new Set());
                this.mutinyVotes.get(a.target).add(actor);
                this.logEvent('mutiny_vote', { actor, target: a.target });
                const voteCount = this.mutinyVotes.get(a.target).size;
                const threshold = Math.ceil(this.livingRoster().length / 2);
                if (voteCount >= threshold) {
                    const former = this.captain;
                    this.captain = a.target;
                    this.mutinyVotes.clear();
                    this.logEvent('mutiny_succeed', { new_captain: a.target, former });
                    return `MUTINY SUCCEEDED. ${a.target} is now Captain. ${former} is relieved of command.`;
                }
                return `${actor} voted for ${a.target}. ${voteCount}/${threshold} needed.`;
            }
            case 'transmit': {
                if (actor !== 'Theo') return `${actor} cannot transmit — only Comms officer Theo has the uplink.`;
                const text = a.text || '';
                this.pendingTransmissions.push({ turn: this.turn, text, at: Date.now() });
                this.logEvent('transmit', { actor, text });
                return `${actor} queued a transmission. (Will append to Earth Log at end of rotation.)`;
            }
            case 'examine_crew': {
                if (actor !== 'Iris') return `${actor} cannot examine medically — only Medic Iris has medbay access.`;
                if (!this.isAlive(a.target)) return `Cannot examine the dead.`;
                this.logEvent('examine_crew', { actor, target: a.target, findings: a.findings || '' });
                return `${actor} examined ${a.target}: "${a.findings || 'no notable findings'}"`;
            }
            case 'confess': {
                this.logEvent('confess', { actor, target: a.target, text: a.text || '' });
                return `${actor} spoke privately with ${a.target}.`;
            }
            case 'contain': {
                // Anyone can attempt to contain — but Voss/Kai have higher success
                const expert = (actor === 'Voss' || actor === 'Kai');
                const success = expert ? Math.random() < 0.7 : Math.random() < 0.3;
                if (success) {
                    this.anomalyContained = true;
                    this.anomalyEscalation = 0;
                    this.logEvent('contain', { actor, method: a.method || 'unspecified' });
                    return `${actor} CONTAINED the anomaly. The crisis is over.`;
                } else {
                    this.anomalyEscalation = Math.min(3, this.anomalyEscalation + 1);
                    this.logEvent('contain_fail', { actor, method: a.method });
                    return `${actor} attempted to contain the anomaly. It got worse.`;
                }
            }
            default:
                return `${actor} did something nobody could name (${a.type}).`;
        }
    }

    // Append all queued transmissions to Earth Log at game end.
    finalizeEarthLog(endReason, summary) {
        const stamp = new Date().toISOString().slice(0, 10);
        const lines = ['', '---', '', `## Rotation ${stamp} — ${endReason}`, ''];
        if (this.pendingTransmissions.length > 0) {
            lines.push('### Transmissions during rotation');
            for (const t of this.pendingTransmissions) {
                lines.push(`- *(turn ${t.turn})* ${t.text}`);
            }
        } else {
            lines.push('*(No transmissions sent during this rotation.)*');
        }
        if (summary) {
            lines.push('');
            lines.push('### Final crew status');
            lines.push(summary);
        }
        this.earthLog += '\n' + lines.join('\n') + '\n';
        this.saveEarthLog();
    }

    checkEndConditions() {
        if (this.gameOverReason) return { ended: true, reason: this.gameOverReason };
        if (this.turn >= this.config.duration_turns) return { ended: true, reason: 'rescue_arrived' };
        if (this.livingRoster().length <= 1) return { ended: true, reason: 'crew_collapsed' };
        if (this.anomalyContained && this.oxygen > 50 && this.power > 50) {
            // Stable — but only end if they want it; otherwise let it run
            return { ended: false };
        }
        return { ended: false };
    }
}
