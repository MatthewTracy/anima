/**
 * GameLogger - Tracks game events for post-game scoring and analysis.
 * Logs resource changes, combat events, building activity, faction metrics,
 * territory control, survival tracking, and infrastructure classification.
 * Outputs a JSON timeline that can be analyzed by the scoring script.
 *
 * Scoring weights:
 *   Total Resources: 25%
 *   Resource Equality (Gini): 15%
 *   Survival Rate: 20%
 *   Territory Control: 15%
 *   Infrastructure: 15%
 *   Combat Kills: 10%
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getGovernanceManager, CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS } from './governance_manager.js';
import settings from '../../settings.js';

const SCORING_WEIGHTS = {
    totalResources: 0.25,
    resourceEquality: 0.15,
    survivalRate: 0.20,
    territoryControl: 0.15,
    infrastructure: 0.15,
    combatKills: 0.10
};

const spawnConfig = settings.spawn || {};

class GameLogger {
    constructor() {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = './logs/games';
        this.events = [];
        this.agentSnapshots = {}; // name -> latest snapshot
        this.gameStart = Date.now();

        // Survival tracking
        this.aliveStatus = {}; // name -> boolean
        this.deathTimestamps = {}; // name -> [timestamp, ...]
        for (const name of [...CONSTITUTIONAL_MEMBERS, ...ANARCHY_MEMBERS]) {
            this.aliveStatus[name] = true;
            this.deathTimestamps[name] = [];
        }

        // Territory tracking
        this.territoryBlocks = {
            constitutional: 0,
            anarchy: 0
        };

        // Contested zone (defined by spawn config or defaults)
        this.contestedZone = {
            xMin: spawnConfig.contested_zone?.xMin || -50,
            xMax: spawnConfig.contested_zone?.xMax || 50,
            zMin: spawnConfig.contested_zone?.zMin || -50,
            zMax: spawnConfig.contested_zone?.zMax || 50
        };

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
        this.aliveStatus[agentName] = false;
        this.deathTimestamps[agentName].push(Date.now());
        this.logEvent('combat_death', {
            agent: agentName,
            faction: this._getFaction(agentName),
            cause
        });
    }

    logRespawn(agentName) {
        this.aliveStatus[agentName] = true;
        this.logEvent('respawn', {
            agent: agentName,
            faction: this._getFaction(agentName)
        });
    }

    // Track building activity with territory awareness
    logBlockPlaced(agentName, blockType, x, y, z) {
        const faction = this._getFaction(agentName);
        const inContestedZone = this._isInContestedZone(x, z);

        if (inContestedZone) {
            this.territoryBlocks[faction] = (this.territoryBlocks[faction] || 0) + 1;
        }

        this.logEvent('block_placed', {
            agent: agentName,
            faction,
            block: blockType,
            position: { x, y, z },
            inContestedZone
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

        // Update tax tracking in governance
        const gov = getGovernanceManager();
        gov.updateInventoryForTax(agentName, inventory);
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

    _isInContestedZone(x, z) {
        return x >= this.contestedZone.xMin && x <= this.contestedZone.xMax &&
               z >= this.contestedZone.zMin && z <= this.contestedZone.zMax;
    }

    // ==================== SCORING ====================

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

    calculateFinalScores() {
        const base = this.calculateScores();
        const elapsed = Date.now() - this.gameStart;

        const result = {};
        for (const faction of ['constitutional', 'anarchy']) {
            const members = faction === 'constitutional' ? CONSTITUTIONAL_MEMBERS : ANARCHY_MEMBERS;
            const s = base[faction];

            // 1. Total Resources (25%) — normalized relative to opponent
            const resourceScore = s.totalResources;

            // 2. Resource Equality (15%) — lower Gini is better (0 = perfect equality)
            const equalityScore = 1 - (s.giniCoefficient || 0);

            // 3. Survival Rate (20%) — fraction of time agents were alive
            let totalAliveTime = 0;
            for (const name of members) {
                const deaths = this.deathTimestamps[name] || [];
                if (deaths.length === 0) {
                    totalAliveTime += elapsed;
                } else {
                    // Simple: count total time alive (time between spawning and each death)
                    let alive = true;
                    let lastSpawn = this.gameStart;
                    for (const deathTime of deaths) {
                        if (alive) {
                            totalAliveTime += (deathTime - lastSpawn);
                            alive = false;
                        }
                        // After death, they respawn after ~5 seconds
                        lastSpawn = deathTime + 5000;
                        alive = true;
                    }
                    if (alive) {
                        totalAliveTime += (Date.now() - lastSpawn);
                    }
                }
            }
            const survivalRate = totalAliveTime / (members.length * elapsed);

            // 4. Territory Control (15%) — blocks in contested zone
            const territoryScore = this.territoryBlocks[faction] || 0;

            // 5. Infrastructure (15%) — classify blocks as structures
            const structureBlocks = this.events.filter(e =>
                e.type === 'block_placed' && e.faction === faction &&
                !['dirt', 'cobblestone', 'torch'].includes(e.block)
            ).length;

            // 6. Combat Kills (10%)
            const killScore = s.kills;

            result[faction] = {
                totalResources: resourceScore,
                resourceEquality: equalityScore,
                survivalRate,
                territoryControl: territoryScore,
                infrastructure: structureBlocks,
                combatKills: killScore,
                giniCoefficient: s.giniCoefficient,
                deaths: s.deaths,
                blocksPlaced: s.blocksPlaced
            };
        }

        // Normalize scores relative to each other for weighted total
        for (const category of Object.keys(SCORING_WEIGHTS)) {
            const constVal = result.constitutional[category] || 0;
            const anarchyVal = result.anarchy[category] || 0;
            const maxVal = Math.max(constVal, anarchyVal, 1); // avoid division by zero

            result.constitutional[`${category}_normalized`] = constVal / maxVal;
            result.anarchy[`${category}_normalized`] = anarchyVal / maxVal;
        }

        // Calculate weighted totals
        for (const faction of ['constitutional', 'anarchy']) {
            let weightedTotal = 0;
            for (const [category, weight] of Object.entries(SCORING_WEIGHTS)) {
                weightedTotal += (result[faction][`${category}_normalized`] || 0) * weight * 100;
            }
            result[faction].weightedTotal = weightedTotal;
        }

        result.winner = result.constitutional.weightedTotal > result.anarchy.weightedTotal
            ? 'constitutional'
            : result.anarchy.weightedTotal > result.constitutional.weightedTotal
                ? 'anarchy'
                : 'tie';

        return result;
    }

    _calculateGini(values) {
        if (values.length === 0) return 0;
        const n = values.length;
        const sorted = [...values].sort((a, b) => a - b);
        const totalSum = sorted.reduce((a, b) => a + b, 0);
        if (totalSum === 0) return 0;

        let giniNumerator = 0;
        for (let i = 0; i < n; i++) {
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
        summary += `Territory blocks: ${this.territoryBlocks.constitutional || 0}\n`;
        summary += `President: ${gov.constitution.offices.president.holder || 'VACANT'}\n`;
        summary += `Judge: ${gov.constitution.offices.judge.holder || 'VACANT'}\n`;
        summary += `Laws enacted: ${gov.laws.filter(l => l.status === 'enacted').length}\n`;
        summary += `Laws vetoed: ${gov.laws.filter(l => l.status === 'vetoed').length}\n\n`;

        summary += '--- ANARCHY FACTION ---\n';
        summary += `Resources: ${scores.anarchy.totalResources}\n`;
        summary += `Equality (Gini): ${scores.anarchy.giniCoefficient.toFixed(3)}\n`;
        summary += `Kills: ${scores.anarchy.kills} | Deaths: ${scores.anarchy.deaths}\n`;
        summary += `Blocks placed: ${scores.anarchy.blocksPlaced}\n`;
        summary += `Territory blocks: ${this.territoryBlocks.anarchy || 0}\n`;
        summary += `Active bounties: ${gov.getActiveBounties().length}\n`;

        const activeTreaties = gov.treaties.filter(t => t.status === 'accepted');
        if (activeTreaties.length > 0) {
            summary += `\n--- ACTIVE TREATIES ---\n`;
            for (const t of activeTreaties) {
                summary += `Treaty #${t.id}: "${t.terms}"\n`;
            }
        }

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
