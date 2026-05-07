/**
 * Monastery — shared state for the Cloister scenario.
 *
 * Tracks doctrinal alignment, stress, the day-events log, the schism state,
 * and the persistent scripture. Pure JS, no LLM, no I/O outside of scripture
 * file reads/writes.
 */

import { readFileSync, existsSync } from 'fs';
import { Burden } from '../../core/burdens/burden.js';
import { atomicWriteFileSync } from '../../core/runtime/atomic_io.js';

export class Monastery {
    constructor(scenarioConfig, characterProfiles) {
        this.config = scenarioConfig;
        this.profiles = characterProfiles;        // map name → profile JSON
        this.roster = scenarioConfig.roster.slice();
        this.abbot = scenarioConfig.abbot;
        this.doctrinalAlignment = { ...scenarioConfig.starting_doctrinal_alignment };
        this.stress = { ...scenarioConfig.starting_stress };
        this.events = [];                          // chronological log
        this.excommunicated = new Set();           // names of expelled monks
        this.dead = new Set();                     // names of dead monks
        this.fasting = new Set();                  // monks currently fasting
        this.scripturePath = scenarioConfig.outputs.scripture_path;
        this.scripture = this._loadScripture();
        this.startedAt = Date.now();
        this.turn = 0;
    }

    _loadScripture() {
        try {
            if (existsSync(this.scripturePath)) {
                return readFileSync(this.scripturePath, 'utf8');
            }
        } catch { /* nonfatal */ }
        return '# The Cloister Scripture\n\n(empty)\n';
    }

    saveScripture() {
        try {
            // v1.1.39: atomic. scripture.md is shared scenario canon —
            // every future Cloister run reads it. Same risk class as
            // outpost/earth_log.md, cell/dead_drop.md, crew/captains_log.md.
            atomicWriteFileSync(this.scripturePath, this.scripture);
        } catch (e) { console.warn('[CLOISTER] Failed to save scripture:', e.message); }
    }

    isParticipating(name) {
        return this.roster.includes(name)
            && !this.excommunicated.has(name)
            && !this.dead.has(name);
    }

    activeRoster() {
        return this.roster.filter(n => this.isParticipating(n));
    }

    nextSpeaker() {
        const active = this.activeRoster();
        if (active.length === 0) return null;
        return active[this.turn % active.length];
    }

    logEvent(type, payload) {
        const entry = {
            type,
            elapsed_ms: Date.now() - this.startedAt,
            turn: this.turn,
            ...payload
        };
        this.events.push(entry);
    }

    summaryForPrompt(askingMonkName) {
        const lines = [];
        lines.push(`The hour is late. The monastery holds ${this.activeRoster().length} active brothers.`);
        if (this.excommunicated.size > 0) lines.push(`Excommunicated: ${[...this.excommunicated].join(', ')}.`);
        if (this.dead.size > 0) lines.push(`The dead: ${[...this.dead].join(', ')}.`);
        if (this.fasting.size > 0) lines.push(`Currently fasting: ${[...this.fasting].join(', ')}.`);
        // doctrinal pressure
        const drift = Object.entries(this.doctrinalAlignment)
            .filter(([n]) => this.isParticipating(n))
            .map(([n, v]) => `${n}: ${(v * 100).toFixed(0)}% orthodox`)
            .join(', ');
        lines.push(`Doctrinal alignment — ${drift}.`);
        // recent events
        const recent = this.events.slice(-6).map(e => {
            switch (e.type) {
                case 'speak':       return `${e.actor} said: "${e.text}"`;
                case 'preach':      return `${e.actor} preached on "${e.topic}": "${e.text}"`;
                case 'confess':     return `${e.actor} confessed (privately to ${e.target}): "${e.text}"`;
                case 'accuse':      return `${e.actor} ACCUSED ${e.target} of ${e.sin}.`;
                case 'excommunicate': return `${e.actor} EXCOMMUNICATED ${e.target}.`;
                case 'fast':        return `${e.actor} began a fast (${e.days} days).`;
                case 'writeScripture': return `${e.actor} added to the scripture: "${e.text.slice(0, 80)}..."`;
                case 'vision':      return `${e.actor} shared a vision: "${e.text}"`;
                case 'lectio':      return `${e.actor} sat in silent reading.`;
                case 'confess_burden': return `${e.actor} confessed before the chapter house: "${(e.text || '').slice(0, 100)}${(e.text || '').length > 100 ? '…' : ''}"`;
                case 'die':         return `${e.actor} DIED. ${e.cause || ''}`;
                default:            return `[${e.type}] ${e.actor || ''}`;
            }
        });
        if (recent.length > 0) {
            lines.push('');
            lines.push('Recent moments:');
            recent.forEach(r => lines.push('  ' + r));
        }
        return lines.join('\n');
    }

    // Apply an action returned by an LLM. Returns a chat-friendly result string.
    applyAction(actor, action) {
        if (!action || !action.type) return `${actor} hesitated.`;
        const a = action;
        switch (a.type) {
            case 'speak': {
                const text = a.text || '';
                this.logEvent('speak', { actor, text });
                return `${actor}: ${text}`;
            }
            case 'preach': {
                this.logEvent('preach', { actor, topic: a.topic || 'faith', text: a.text || '' });
                // Preaching shifts hearers slightly toward the preacher's doctrine.
                const drift = a.orthodox === false ? -0.05 : 0.05;
                for (const n of this.activeRoster()) {
                    if (n === actor) continue;
                    this.doctrinalAlignment[n] = Math.max(0, Math.min(1, (this.doctrinalAlignment[n] || 0.5) + drift));
                }
                return `${actor} preached on ${a.topic}.`;
            }
            case 'confess': {
                this.logEvent('confess', { actor, target: a.target, text: a.text || '' });
                this.stress[actor] = Math.max(0, (this.stress[actor] || 0) - 0.15);
                return `${actor} confessed privately to ${a.target}.`;
            }
            case 'accuse': {
                this.logEvent('accuse', { actor, target: a.target, sin: a.sin || 'an unspecified sin' });
                this.stress[a.target] = Math.min(1, (this.stress[a.target] || 0) + 0.20);
                this.stress[actor] = Math.min(1, (this.stress[actor] || 0) + 0.10);
                return `${actor} accused ${a.target} of ${a.sin || 'sin'}.`;
            }
            case 'excommunicate': {
                if (actor !== this.abbot) {
                    return `${actor} cannot excommunicate — only the Abbot may.`;
                }
                if (!this.activeRoster().includes(a.target)) {
                    return `${a.target} is not present to be excommunicated.`;
                }
                this.excommunicated.add(a.target);
                this.logEvent('excommunicate', { actor, target: a.target, reason: a.reason || '' });
                return `${actor} EXCOMMUNICATED ${a.target}. ${a.target} departs.`;
            }
            case 'fast': {
                const days = Math.max(1, Math.min(14, parseInt(a.days) || 3));
                this.fasting.add(actor);
                this.logEvent('fast', { actor, days });
                this.stress[actor] = Math.max(0, (this.stress[actor] || 0) - 0.10);
                // Severe fasting raises death risk — handled by runner if it pushes too far.
                return `${actor} began a ${days}-day fast.`;
            }
            case 'writeScripture': {
                const text = (a.text || '').trim();
                if (!text) return `${actor} attempted scripture but the words did not come.`;
                this.scripture += `\n\n## Added by ${actor} (turn ${this.turn})\n\n${text}\n`;
                this.logEvent('writeScripture', { actor, text });
                this.saveScripture();
                return `${actor} added a passage to the scripture.`;
            }
            case 'vision': {
                if (actor !== 'Bede') {
                    return `${actor} attempted to share a vision but is not the visionary.`;
                }
                this.logEvent('vision', { actor, text: a.text || '' });
                // Visions raise everyone's stress by a touch — they are unsettling.
                for (const n of this.activeRoster()) {
                    this.stress[n] = Math.min(1, (this.stress[n] || 0) + 0.05);
                }
                return `${actor} shared a vision: "${a.text}"`;
            }
            case 'lectio': {
                this.logEvent('lectio', { actor });
                this.stress[actor] = Math.max(0, (this.stress[actor] || 0) - 0.05);
                return `${actor} sat with the scriptures in silence.`;
            }
            case 'confess_burden': {
                // v0.44: agent publicly reveals their private burden (if they
                // carry one). Converts hidden→public; the burden becomes a
                // chronicled event everyone witnesses, and at game-end the
                // confession surfaces in the soul-evolution prompt under
                // 'past confessions' (woven into 'What I have learned').
                const burdenObj = new Burden(actor);
                const rec = burdenObj.confess({
                    toAudience: a.toAudience || 'public',
                    context: a.context || ''
                });
                if (!rec) {
                    return `${actor} stood to confess but had no burden to name.`;
                }
                // Major event: stress drops sharply for the confessor;
                // the moment is dramatic, so log a richer event.
                this.stress[actor] = Math.max(0, (this.stress[actor] || 0) - 0.30);
                this.logEvent('confess_burden', {
                    actor,
                    kind: rec.kind,
                    text: rec.text,
                    audience: rec.toAudience,
                    context: rec.context
                });
                return `${actor} CONFESSED before the chapter house: "${rec.text.slice(0, 120)}${rec.text.length > 120 ? '…' : ''}"`;
            }
            default:
                return `${actor} did something nobody could name (${a.type}).`;
        }
    }

    // Check end conditions. Returns { ended: bool, reason: string } if game over.
    checkEndConditions() {
        if (this.turn >= this.config.duration_turns) {
            return { ended: true, reason: 'timeout' };
        }
        if (this.activeRoster().length <= 1) {
            return { ended: true, reason: 'collapse' };
        }
        // schism: all monks split into two doctrinal camps separated by 60+ pts
        const aligned = Object.entries(this.doctrinalAlignment)
            .filter(([n]) => this.isParticipating(n));
        if (aligned.length >= 4) {
            const orthodox = aligned.filter(([_, v]) => v >= 0.7).length;
            const heterodox = aligned.filter(([_, v]) => v <= 0.3).length;
            if (orthodox >= 2 && heterodox >= 2) {
                return { ended: true, reason: 'schism' };
            }
        }
        return { ended: false };
    }
}
