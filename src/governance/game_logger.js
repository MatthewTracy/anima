/**
 * GameLogger - Tracks game events for post-game scoring and analysis.
 * Logs resource changes, combat events, building activity, and faction metrics.
 * Outputs a JSON timeline that can be analyzed by the scoring script.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getGovernanceManager, CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS } from './governance_manager.js';

class GameLogger {
    constructor() {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = './logs/games';
        this.events = [];
        this.agentSnapshots = {}; // name -> latest snapshot
        this.gameStart = Date.now();

        try {
            if (!existsSync(this.logDir)) {
                mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create game log directory:', e.message);
        }
    }

    logEvent(type, data) {
        const event = {
            type,
            timestamp: Date.now(),
            elapsed_ms: Date.now() - this.gameStart,
            time: new Date().toISOString(),
            ...data
        };
        this.events.push(event);

        // Auto-save every 20 events
        if (this.events.length % 20 === 0) {
            this.save();
        }
    }

    // Track when an agent collects resources
    logResourceCollected(agentName, item, amount) {
        this.logEvent('resource_collected', {
            agent: agentName,
            faction: this._getFaction(agentName),
            item,
            amount
        });
    }

    // Track combat events
    logCombatKill(killerName, victimName) {
        this.logEvent('combat_kill', {
            killer: killerName,
            killer_faction: this._getFaction(killerName),
            victim: victimName,
            victim_faction: this._getFaction(victimName)
        });
    }

    logCombatDeath(agentName, cause) {
        this.logEvent('combat_death', {
            agent: agentName,
            faction: this._getFaction(agentName),
            cause
        });
    }

    // Track building activity
    logBlockPlaced(agentName, blockType, x, y, z) {
        this.logEvent('block_placed', {
            agent: agentName,
            faction: this._getFaction(agentName),
            block: blockType,
            position: { x, y, z }
        });
    }

    // Periodic inventory snapshots for scoring
    logInventorySnapshot(agentName, inventory) {
        const snapshot = {
            agent: agentName,
            faction: this._getFaction(agentName),
            timestamp: Date.now(),
            items: inventory
        };
        this.agentSnapshots[agentName] = snapshot;

        this.logEvent('inventory_snapshot', snapshot);
    }

    // Track agent chat messages
    logChat(agentName, message, isGovernance = false) {
        this.logEvent('chat', {
            agent: agentName,
            faction: this._getFaction(agentName),
            message,
            isGovernance
        });
    }

    _getFaction(name) {
        if (CONSTITUTIONAL_MEMBERS.includes(name)) return 'constitutional';
        if (ANARCHY_MEMBERS.includes(name)) return 'anarchy';
        return 'unknown';
    }

    // Calculate faction scores based on current state
    calculateScores() {
        const scores = {
            constitutional: { totalResources: 0, agentResources: {}, kills: 0, deaths: 0, blocksPlaced: 0 },
            anarchy: { totalResources: 0, agentResources: {}, kills: 0, deaths: 0, blocksPlaced: 0 }
        };

        // Count resources from latest snapshots
        for (const [name, snapshot] of Object.entries(this.agentSnapshots)) {
            const faction = this._getFaction(name);
            if (!scores[faction]) continue;

            let agentTotal = 0;
            if (snapshot.items) {
                for (const [item, count] of Object.entries(snapshot.items)) {
                    agentTotal += count;
                }
            }
            scores[faction].agentResources[name] = agentTotal;
            scores[faction].totalResources += agentTotal;
        }

        // Count combat events
        for (const event of this.events) {
            if (event.type === 'combat_kill') {
                if (scores[event.killer_faction]) scores[event.killer_faction].kills++;
                if (scores[event.victim_faction]) scores[event.victim_faction].deaths++;
            }
            if (event.type === 'block_placed') {
                if (scores[event.faction]) scores[event.faction].blocksPlaced++;
            }
        }

        // Calculate Gini coefficient for resource equality
        for (const faction of ['constitutional', 'anarchy']) {
            const values = Object.values(scores[faction].agentResources);
            scores[faction].giniCoefficient = this._calculateGini(values);
        }

        return scores;
    }

    _calculateGini(values) {
        if (values.length === 0) return 0;
        const n = values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const totalSum = sorted.reduce((a, b) => a + b, 0);
        if (totalSum === 0) return 0;

        let cumulativeSum = 0;
        let giniNumerator = 0;
        for (let i = 0; i < n; i++) {
            cumulativeSum += sorted[i];
            giniNumerator += (2 * (i + 1) - n - 1) * sorted[i];
        }

        return giniNumerator / (n * totalSum);
    }

    save() {
        try {
            const filename = join(this.logDir, `game_${this.sessionId}.json`);
            const data = {
                sessionId: this.sessionId,
                gameStart: new Date(this.gameStart).toISOString(),
                lastUpdate: new Date().toISOString(),
                elapsedMinutes: ((Date.now() - this.gameStart) / 60000).toFixed(1),
                eventCount: this.events.length,
                scores: this.calculateScores(),
                events: this.events
            };
            writeFileSync(filename, JSON.stringify(data, null, 2));
        } catch (e) {
            console.warn('Could not save game log:', e.message);
        }
    }

    getSummary() {
        const scores = this.calculateScores();
        const elapsed = ((Date.now() - this.gameStart) / 60000).toFixed(1);
        const gov = getGovernanceManager();

        let summary = `=== GAME STATUS (${elapsed} min) ===\n\n`;

        summary += '--- CONSTITUTIONAL FACTION ---\n';
        summary += `Resources: ${scores.constitutional.totalResources}\n`;
        summary += `Equality (Gini): ${scores.constitutional.giniCoefficient.toFixed(3)} (0=perfect equality, 1=total inequality)\n`;
        summary += `Kills: ${scores.constitutional.kills} | Deaths: ${scores.constitutional.deaths}\n`;
        summary += `Blocks placed: ${scores.constitutional.blocksPlaced}\n`;
        summary += `President: ${gov.constitution.offices.president.holder || 'VACANT'}\n`;
        summary += `Judge: ${gov.constitution.offices.judge.holder || 'VACANT'}\n`;
        summary += `Laws enacted: ${gov.laws.filter(l => l.status === 'enacted').length}\n\n`;

        summary += '--- ANARCHY FACTION ---\n';
        summary += `Resources: ${scores.anarchy.totalResources}\n`;
        summary += `Equality (Gini): ${scores.anarchy.giniCoefficient.toFixed(3)}\n`;
        summary += `Kills: ${scores.anarchy.kills} | Deaths: ${scores.anarchy.deaths}\n`;
        summary += `Blocks placed: ${scores.anarchy.blocksPlaced}\n`;

        return summary;
    }
}

// Singleton
let instance = null;

export function getGameLogger() {
    if (!instance) {
        instance = new GameLogger();
    }
    return instance;
}
