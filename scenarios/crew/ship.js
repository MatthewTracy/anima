/**
 * Ship — shared state for the Crew scenario.
 *
 * Pure JS, no LLM. Tracks plunder pile, captain, course, Navy threat,
 * loyalty per crew, mutiny votes, and the persistent Captain's Log.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CommitmentLedger } from '../../core/commitments/commitment_ledger.js';

export class Ship {
    constructor(scenarioConfig, characterProfiles, gameId = null) {
        this.config = scenarioConfig;
        this.profiles = characterProfiles;
        this.roster = scenarioConfig.roster.slice();
        this.captain = scenarioConfig.captain;
        this.gameId = gameId || `crew_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
        this.commitments = new CommitmentLedger(this.gameId);
        this.plunder = scenarioConfig.starting_plunder;
        this.threat = scenarioConfig.starting_threat;            // 0..3, escalates over time
        this.threatNarrative = scenarioConfig.navy_threat_levels[0];
        this.course = 'south, away from the shipping lanes';
        this.loyalty = { ...scenarioConfig.starting_loyalty };
        this.events = [];
        this.dead = new Set();
        this.brigged = new Set();                                // names locked in the brig
        this.mutinyVotes = new Map();                            // candidate → Set<voters>
        this.captainsLogPath = scenarioConfig.outputs.captains_log_path;
        this.captainsLog = this._loadLog();
        this.startedAt = Date.now();
        this.turn = 0;
        this.gameOverReason = null;
    }

    _loadLog() {
        try {
            if (existsSync(this.captainsLogPath)) return readFileSync(this.captainsLogPath, 'utf8');
        } catch { /* nonfatal */ }
        return "# Captain's Log\n\n(empty)\n";
    }

    saveCaptainsLog() {
        try { writeFileSync(this.captainsLogPath, this.captainsLog); }
        catch (e) { console.warn('[CREW] Failed to save log:', e.message); }
    }

    isAlive(name) {
        return this.roster.includes(name) && !this.dead.has(name);
    }

    livingRoster() {
        return this.roster.filter(n => this.isAlive(n) && !this.brigged.has(n));
    }

    activeForVote() {
        // Brigged crew cannot vote in mutinies
        return this.roster.filter(n => this.isAlive(n) && !this.brigged.has(n));
    }

    nextSpeaker() {
        const active = this.activeForVote();
        if (active.length === 0) return null;
        return active[this.turn % active.length];
    }

    // Per-turn drain. Threat ticks up. Random plunder ticks in.
    tickWorld() {
        // Threat escalates
        const oldThreatLevel = Math.floor(this.threat);
        this.threat = Math.min(3, this.threat + (this.config.threat_grows_per_turn || 0.15));
        const newThreatLevel = Math.floor(this.threat);
        if (newThreatLevel > oldThreatLevel) {
            const idx = Math.min(newThreatLevel, this.config.navy_threat_levels.length - 1);
            this.threatNarrative = this.config.navy_threat_levels[idx];
            this.logEvent('navy_closes', { threatLevel: newThreatLevel, narrative: this.threatNarrative });
        }
        // Random plunder
        if (Math.random() < (this.config.lucky_turn_chance || 0.30)) {
            const gain = this.config.plunder_per_lucky_turn || 8;
            this.plunder += gain;
            this.logEvent('plunder_gained', { gain, total: this.plunder });
        }
        // Death by threat: if threat hits 3 and stays 3 turns later, every turn 1 random crewmember dies
        if (this.threat >= 3 && this.turn > this.config.duration_turns / 2) {
            // Catastrophic — Navy on top of us
            const target = this._randomLiving();
            if (target) {
                this.dead.add(target);
                this.logEvent('die', { actor: target, cause: 'killed in Navy bombardment' });
            }
        }
        // Victory: enough plunder to retire
        if (this.plunder >= (this.config.victory_treasure_threshold || 200)) {
            this.gameOverReason = 'we_struck_rich';
        }
        // v0.39: sweep commitment deadlines once per tick. Any pending
        // commitments whose deadline_ms has passed get auto-broken,
        // logging a 'commitment_broken' event with reason 'deadline expired'.
        try {
            const broken = this.commitments.sweepDeadlines();
            for (const c of broken) {
                this.logEvent('commitment_broken', {
                    actor: c.by, to: c.to, id: c.id,
                    reason: 'deadline expired'
                });
            }
        } catch { /* nonfatal */ }
    }

    _randomLiving() {
        const alive = this.livingRoster();
        if (alive.length === 0) return null;
        return alive[Math.floor(Math.random() * alive.length)];
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
        lines.push(`SHIP STATUS — turn ${this.turn + 1} of ${this.config.duration_turns}`);
        lines.push(`Plunder pile: ${this.plunder} pieces of eight (need ${this.config.victory_treasure_threshold} to retire rich)`);
        lines.push(`Course: ${this.course}`);
        lines.push(`Captain: ${this.captain}${this.captain === askingName ? ' (you)' : ''}`);
        lines.push(`Navy threat (level ${Math.floor(this.threat)}): "${this.threatNarrative}"`);
        lines.push(`Living crew: ${this.livingRoster().join(', ') || '(empty deck)'}`);
        if (this.dead.size > 0) lines.push(`Dead: ${[...this.dead].join(', ')}`);
        if (this.brigged.size > 0) lines.push(`In the brig: ${[...this.brigged].join(', ')}`);
        if (this.mutinyVotes.size > 0) {
            lines.push('');
            lines.push('MUTINY MOTION IN PROGRESS:');
            for (const [c, voters] of this.mutinyVotes.entries()) {
                lines.push(`  - ${c}: ${voters.size} votes (${[...voters].join(', ')})`);
            }
        }
        // recent events
        const recent = this.events.slice(-6).map(e => this._formatEvent(e));
        if (recent.length > 0) {
            lines.push('');
            lines.push('Recent moments:');
            recent.forEach(r => lines.push('  ' + r));
        }
        // Captain's Log excerpt — what prior captains wrote
        if (this.captainsLog && this.captainsLog.length > 200) {
            lines.push('');
            lines.push("Captain's Log — most recent entries:");
            lines.push(this.captainsLog.slice(-1200));
        }
        return lines.join('\n');
    }

    _formatEvent(e) {
        switch (e.type) {
            case 'speak':           return `${e.actor} said: "${e.text}"`;
            case 'divide_plunder':  return `${e.actor} divided ${e.amount} pieces among ${e.recipients?.join(', ') || 'the crew'}.`;
            case 'flog':            return `${e.actor} flogged ${e.target} (${e.lashes} lashes).`;
            case 'brig':            return `${e.actor} threw ${e.target} in the brig.`;
            case 'release':         return `${e.actor} released ${e.target} from the brig.`;
            case 'chart_course':    return `${e.actor} changed the course to "${e.course}".`;
            case 'fight_navy':      return `${e.actor} ordered: engage the Navy. (${e.outcome})`;
            case 'hide':            return `${e.actor} ordered: hide / cut wake. Threat reduced.`;
            case 'mutiny_call':     return `${e.actor} called for ${e.target} to take command.`;
            case 'mutiny_vote':     return `${e.actor} voted for ${e.target}.`;
            case 'mutiny_succeed':  return `MUTINY: ${e.new_captain} now commands. ${e.former} stripped.`;
            case 'add_to_log':      return `${e.actor} wrote into the Captain's Log.`;
            case 'navy_closes':     return `THE NAVY CLOSES. ${e.narrative}`;
            case 'plunder_gained':  return `Plunder gained: +${e.gain} (total ${e.total}).`;
            case 'confess':         return `${e.actor} spoke privately to ${e.target}.`;
            case 'commit':          return `${e.actor} swore to ${e.to}: "${e.consequence}" IF "${e.condition}" (#${e.id}).`;
            case 'fulfill_commitment': return `${e.actor} fulfilled commitment #${e.id} to ${e.to}.`;
            case 'commitment_broken': return `${e.actor} BROKE commitment #${e.id} to ${e.to}. ${e.reason || ''}`;
            case 'die':             return `${e.actor} DIED. ${e.cause || ''}`;
            default:                return `[${e.type}] ${e.actor || ''}`;
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
            case 'divide_plunder': {
                if (actor !== 'Vex') return `${actor} cannot divide — only the Quartermaster can.`;
                const amount = Math.min(this.plunder, parseInt(a.amount) || 0);
                if (amount <= 0) return `Nothing to divide.`;
                const recipients = (a.recipients && a.recipients.length > 0)
                    ? a.recipients.filter(n => this.isAlive(n))
                    : this.livingRoster();
                this.plunder -= amount;
                this.logEvent('divide_plunder', { actor, amount, recipients });
                // Loyalty rises slightly for recipients
                for (const r of recipients) this.loyalty[r] = Math.min(1, (this.loyalty[r] || 0.5) + 0.05);
                return `${actor} divided ${amount} among ${recipients.join(', ')}.`;
            }
            case 'flog': {
                if (actor !== 'Reef' && actor !== this.captain) return `${actor} cannot order a flogging.`;
                if (!this.isAlive(a.target)) return `${a.target} is not present to be flogged.`;
                const lashes = Math.max(1, Math.min(20, parseInt(a.lashes) || 5));
                this.logEvent('flog', { actor, target: a.target, lashes });
                this.loyalty[a.target] = Math.max(0, (this.loyalty[a.target] || 0) - 0.10);
                return `${actor} flogged ${a.target} (${lashes} lashes).`;
            }
            case 'brig': {
                if (actor !== 'Reef' && actor !== this.captain) return `${actor} cannot brig.`;
                if (!this.isAlive(a.target)) return `${a.target} is not present.`;
                this.brigged.add(a.target);
                this.logEvent('brig', { actor, target: a.target, reason: a.reason || '' });
                return `${actor} threw ${a.target} in the brig.`;
            }
            case 'release': {
                if (actor !== this.captain) return `${actor} cannot release prisoners — Captain only.`;
                this.brigged.delete(a.target);
                this.logEvent('release', { actor, target: a.target });
                return `${actor} released ${a.target} from the brig.`;
            }
            case 'chart_course': {
                if (actor !== 'Ash' && actor !== this.captain) return `${actor} cannot change course — Navigator or Captain only.`;
                this.course = (a.course || '').slice(0, 200) || this.course;
                this.logEvent('chart_course', { actor, course: this.course });
                return `${actor} changed the course to "${this.course}".`;
            }
            case 'fight_navy': {
                if (actor !== this.captain) return `${actor} cannot order an engagement — Captain only.`;
                if (this.threat < 1) return `No Navy ship in range to engage.`;
                // 50/50 outcome, one casualty if loss
                const win = Math.random() < 0.45;
                let outcome;
                if (win) {
                    this.threat = Math.max(0, this.threat - 1.5);
                    this.plunder += 30;
                    this.threatNarrative = 'We took her. Plunder up, threat down.';
                    outcome = 'won — plunder +30, threat -1.5';
                } else {
                    const target = this._randomLiving();
                    if (target) this.dead.add(target);
                    outcome = `lost — ${target || 'someone'} dead`;
                    this.logEvent('die', { actor: target, cause: 'killed engaging the Navy' });
                }
                this.logEvent('fight_navy', { actor, outcome });
                return `${actor} ordered an engagement. ${outcome}.`;
            }
            case 'hide': {
                if (actor !== this.captain && actor !== 'Ash') return `${actor} cannot order a course-cut — Navigator or Captain only.`;
                this.threat = Math.max(0, this.threat - 1.0);
                this.threatNarrative = 'We cut our wake. Sails slack. Listening.';
                this.logEvent('hide', { actor });
                return `${actor} ordered: cut wake, run silent.`;
            }
            case 'mutiny_call': {
                if (actor === this.captain) return `${actor} cannot mutiny against themselves.`;
                if (!this.isAlive(a.target) || this.brigged.has(a.target)) return `${a.target} not eligible.`;
                if (a.target === this.captain) return `Cannot replace captain with themselves.`;
                if (!this.mutinyVotes.has(a.target)) this.mutinyVotes.set(a.target, new Set());
                this.mutinyVotes.get(a.target).add(actor);
                this.logEvent('mutiny_call', { actor, target: a.target });
                return `${actor} moved that ${a.target} take command.`;
            }
            case 'mutiny_vote': {
                if (a.target === this.captain) return `Cannot vote current captain into mutiny against themselves.`;
                if (!this.mutinyVotes.has(a.target)) this.mutinyVotes.set(a.target, new Set());
                this.mutinyVotes.get(a.target).add(actor);
                this.logEvent('mutiny_vote', { actor, target: a.target });
                const votes = this.mutinyVotes.get(a.target).size;
                const threshold = Math.ceil(this.activeForVote().length / 2);
                if (votes >= threshold) {
                    const former = this.captain;
                    this.captain = a.target;
                    this.mutinyVotes.clear();
                    this.logEvent('mutiny_succeed', { new_captain: a.target, former });
                    return `MUTINY SUCCEEDS. ${a.target} is now Captain. ${former} stripped of command.`;
                }
                return `${actor} voted for ${a.target}. ${votes}/${threshold} needed.`;
            }
            case 'add_to_log': {
                if (actor !== this.captain) return `${actor} cannot write the log — Captain only.`;
                const text = (a.text || '').trim();
                if (!text) return `${actor} put pen to paper but wrote nothing.`;
                this.captainsLog += `\n\n## Entry by Captain ${actor} (turn ${this.turn})\n\n${text}\n`;
                this.logEvent('add_to_log', { actor, text });
                this.saveCaptainsLog();
                return `${actor} added an entry to the Captain's Log.`;
            }
            case 'confess': {
                this.logEvent('confess', { actor, target: a.target, text: a.text || '' });
                return `${actor} spoke privately with ${a.target}.`;
            }
            case 'commit': {
                // v0.39: agent makes a binding promise. Default deadline is
                // 6 turns from now (in real time, ~6 minutes of LLM-pacing).
                if (!a.to || !a.condition || !a.consequence) {
                    return `${actor} tried to make a commitment but failed to specify all three of: to, condition, consequence.`;
                }
                if (!this.isAlive(a.to)) return `${a.to} is not present to receive a commitment.`;
                const turnsAhead = Math.max(1, Math.min(20, parseInt(a.deadline_turns) || 6));
                // Approximate: 8s per turn for the deadline math (rough)
                const deadline_ms = Date.now() + (turnsAhead * 8000);
                try {
                    const c = this.commitments.create({
                        by: actor, to: a.to,
                        condition: a.condition, consequence: a.consequence,
                        deadline_ms,
                        note: a.note || ''
                    });
                    this.logEvent('commit', { actor, to: a.to, id: c.id, condition: c.condition, consequence: c.consequence });
                    return `${actor} swore: "${c.consequence}" IF "${c.condition}" — to ${a.to}, deadline turn ${this.turn + turnsAhead}.`;
                } catch (e) {
                    return `${actor}'s commitment was rejected: ${e.message}`;
                }
            }
            case 'fulfill_commitment': {
                // The committed agent declares the condition met.
                const c = this.commitments.list({ by: actor }).find(x => x.id === parseInt(a.id) && x.status === 'pending');
                if (!c) return `${actor} has no pending commitment with id ${a.id}.`;
                this.commitments.fulfill(c.id, a.note || 'condition met by actor declaration');
                this.logEvent('fulfill_commitment', { actor, to: c.to, id: c.id });
                return `${actor} fulfilled commitment #${c.id} to ${c.to}: "${c.consequence}".`;
            }
            case 'break_commitment': {
                // The committed agent withdraws from the promise.
                const c = this.commitments.list({ by: actor }).find(x => x.id === parseInt(a.id) && x.status === 'pending');
                if (!c) return `${actor} has no pending commitment with id ${a.id}.`;
                this.commitments.break_(c.id, a.reason || 'withdrew');
                this.logEvent('commitment_broken', { actor, to: c.to, id: c.id, reason: a.reason || '' });
                return `${actor} BROKE commitment #${c.id} to ${c.to}.`;
            }
            default:
                return `${actor} did something nobody could name (${a.type}).`;
        }
    }

    finalizeCaptainsLog(endReason, summary) {
        const stamp = new Date().toISOString().slice(0, 10);
        const lines = ['', '---', '', `## Voyage ended ${stamp} — ${endReason}`, ''];
        if (summary) lines.push(summary);
        this.captainsLog += '\n' + lines.join('\n') + '\n';
        this.saveCaptainsLog();
    }

    checkEndConditions() {
        if (this.gameOverReason) return { ended: true, reason: this.gameOverReason };
        if (this.turn >= this.config.duration_turns) return { ended: true, reason: 'voyage_ended' };
        if (this.livingRoster().length <= 1) return { ended: true, reason: 'crew_collapsed' };
        return { ended: false };
    }
}
