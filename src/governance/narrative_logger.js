/**
 * NarrativeLogger - Captures the "story" of a game session in human-readable
 * prose format. While GameLogger tracks raw data for scoring, this captures
 * the drama: elections, betrayals, alliances, battles, and governance decisions.
 *
 * Outputs a Markdown file you can read like a story after each session.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS } from './governance_manager.js';

class NarrativeLogger {
    constructor() {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = './logs/narratives';
        this.entries = [];
        this.gameStart = Date.now();
        this.chapter = 1;

        try {
            if (!existsSync(this.logDir)) {
                mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create narrative log directory:', e.message);
        }

        this._addEntry('prologue', 'The Governance Game begins. Ten AI agents spawn into a Minecraft world, divided into two factions. The Constitutional faction — Madison, Hamilton, Paine, Marshall, and Franklin — believe in democracy, law, and collective governance. The Anarchy faction — Chaos, Wolf, Fox, Bear, and Raven — answer to no one. Who will prevail?');
    }

    _timestamp() {
        const elapsed = Math.floor((Date.now() - this.gameStart) / 1000);
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    _faction(name) {
        if (CONSTITUTIONAL_MEMBERS.includes(name)) return 'Constitutional';
        if (ANARCHY_MEMBERS.includes(name)) return 'Anarchy';
        return 'Unknown';
    }

    _addEntry(category, text) {
        this.entries.push({
            time: this._timestamp(),
            timestamp: Date.now(),
            category,
            text
        });

        // Auto-save every 10 entries
        if (this.entries.length % 10 === 0) {
            this.save();
        }
    }

    // ==================== GOVERNANCE EVENTS ====================

    logElectionCalled(callerName, office) {
        this._addEntry('politics', `**${callerName}** calls for an election for **${office}**. The democratic process begins.`);
    }

    logNomination(candidateName, office) {
        this._addEntry('politics', `**${candidateName}** throws their hat in the ring for **${office}**.`);
    }

    logElectionResult(office, winner, tally) {
        const tallyStr = Object.entries(tally).map(([c, v]) => `${c}: ${v} votes`).join(', ');
        this._addEntry('politics', `**ELECTION RESULT**: **${winner}** wins the **${office}** election! (${tallyStr})`);
    }

    logCampaignSpeech(speakerName, speech) {
        this._addEntry('politics', `**${speakerName}** gives a campaign speech: _"${speech}"_`);
    }

    logLawProposed(proposerName, lawId, lawText) {
        this._addEntry('legislation', `**${proposerName}** proposes Law #${lawId}: _"${lawText}"_`);
    }

    logLawEnacted(lawId, lawText, yesVotes, noVotes) {
        this._addEntry('legislation', `**Law #${lawId} PASSES** (${yesVotes}-${noVotes}): _"${lawText}"_`);
    }

    logLawRejected(lawId, lawText, yesVotes, noVotes) {
        this._addEntry('legislation', `Law #${lawId} fails (${yesVotes}-${noVotes}): _"${lawText}"_`);
    }

    logLawsuitFiled(plaintiff, defendant, violation) {
        this._addEntry('judiciary', `**${plaintiff}** sues **${defendant}** for: _"${violation}"_. The case goes to trial.`);
    }

    logVerdict(judge, defendant, verdict, punishment) {
        if (verdict === 'guilty') {
            this._addEntry('judiciary', `**GUILTY!** Judge **${judge}** finds **${defendant}** guilty. Punishment: _${punishment}_`);
        } else {
            this._addEntry('judiciary', `**NOT GUILTY.** Judge **${judge}** acquits **${defendant}**.`);
        }
    }

    logImpeachment(initiator, official, office, reason) {
        this._addEntry('politics', `**IMPEACHMENT!** **${initiator}** moves to impeach **${official}** (${office}): _"${reason}"_`);
    }

    logTaxPaid(payer, item, amount) {
        this._addEntry('economy', `**${payer}** pays ${amount} ${item} in taxes to the treasury.`);
    }

    logAmendmentRatified(amendmentId, text) {
        this._addEntry('legislation', `**Constitutional Amendment #${amendmentId} RATIFIED**: _"${text}"_`);
    }

    // ==================== COMBAT & SURVIVAL ====================

    logCombat(attacker, defender, outcome) {
        const attackerFaction = this._faction(attacker);
        const defenderFaction = this._faction(defender);
        const isCrossFaction = attackerFaction !== defenderFaction;

        if (outcome === 'kill') {
            if (isCrossFaction) {
                this._addEntry('battle', `**${attacker}** (${attackerFaction}) slays **${defender}** (${defenderFaction}) in cross-faction combat!`);
            } else {
                this._addEntry('betrayal', `**${attacker}** kills their own faction member **${defender}**! Betrayal in the ${attackerFaction} faction!`);
            }
        } else {
            this._addEntry('battle', `**${attacker}** attacks **${defender}** — ${outcome}.`);
        }
    }

    logDeath(agentName, cause) {
        this._addEntry('death', `**${agentName}** (${this._faction(agentName)}) dies. Cause: _${cause}_`);
    }

    // ==================== SOCIAL EVENTS ====================

    logAlliance(agent1, agent2) {
        this._addEntry('diplomacy', `**${agent1}** and **${agent2}** form an alliance.`);
    }

    logBetrayal(betrayer, victim) {
        this._addEntry('betrayal', `**${betrayer}** betrays **${victim}**!`);
    }

    logChat(speaker, message, isPublic = true) {
        // Only log interesting/significant messages, not routine commands
        if (message.startsWith('[GOV]') || message.startsWith('[COURT]') || message.startsWith('[CAMPAIGN]')) {
            this._addEntry('communication', `**${speaker}**: ${message}`);
        }
    }

    logResourceMilestone(agentName, item, totalCount) {
        this._addEntry('economy', `**${agentName}** (${this._faction(agentName)}) accumulates ${totalCount} ${item}.`);
    }

    // ==================== OUTPUT ====================

    save() {
        try {
            const filename = join(this.logDir, `narrative_${this.sessionId}.md`);
            writeFileSync(filename, this._renderMarkdown());
        } catch (e) {
            console.warn('Could not save narrative:', e.message);
        }
    }

    _renderMarkdown() {
        const elapsed = ((Date.now() - this.gameStart) / 60000).toFixed(1);

        let md = `# The Governance Game - Session Report\n`;
        md += `**Date**: ${new Date(this.gameStart).toLocaleDateString()}\n`;
        md += `**Duration**: ${elapsed} minutes\n\n`;
        md += `---\n\n`;

        // Group by time chunks (every 5 minutes = a "chapter")
        let currentChapter = 0;
        for (const entry of this.entries) {
            const entryMinutes = (entry.timestamp - this.gameStart) / 60000;
            const chapter = Math.floor(entryMinutes / 5) + 1;

            if (chapter > currentChapter) {
                currentChapter = chapter;
                if (chapter === 1) {
                    md += `## Chapter 1: The Beginning (0:00 - 5:00)\n\n`;
                } else {
                    const start = (chapter - 1) * 5;
                    const end = chapter * 5;
                    md += `\n## Chapter ${chapter}: ${this._getChapterTitle(chapter)} (${start}:00 - ${end}:00)\n\n`;
                }
            }

            const icon = this._getCategoryIcon(entry.category);
            md += `**[${entry.time}]** ${icon} ${entry.text}\n\n`;
        }

        md += `\n---\n\n`;
        md += `*End of session report. Generated by The Governance Game.*\n`;

        return md;
    }

    _getCategoryIcon(category) {
        const icons = {
            prologue: '',
            politics: '[POLITICS]',
            legislation: '[LAW]',
            judiciary: '[COURT]',
            economy: '[ECONOMY]',
            battle: '[BATTLE]',
            betrayal: '[BETRAYAL]',
            death: '[DEATH]',
            diplomacy: '[DIPLOMACY]',
            communication: '[CHAT]'
        };
        return icons[category] || '';
    }

    _getChapterTitle(chapter) {
        const titles = [
            '', 'The Beginning', 'Establishing Order', 'Power Struggles',
            'Alliances Form', 'The Middle Game', 'Tensions Rise',
            'Conflict Erupts', 'The Turning Point', 'Endgame',
            'The Final Hour', 'Resolution', 'Aftermath'
        ];
        return titles[chapter] || `Minute ${(chapter - 1) * 5} - ${chapter * 5}`;
    }

    getRecentNarrative(count = 10) {
        return this.entries.slice(-count).map(e => `[${e.time}] ${e.text}`).join('\n');
    }
}

// Singleton
let instance = null;

export function getNarrativeLogger() {
    if (!instance) {
        instance = new NarrativeLogger();
    }
    return instance;
}
