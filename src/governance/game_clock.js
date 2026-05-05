/**
 * GameClock - Manages game session timing, periodic warnings, and graceful shutdown.
 * Triggers final scoring and narrative epilogue when time expires.
 */

import settings from '../../settings.js';
import { getGameLogger } from './game_logger.js';
import { getNarrativeLogger } from './narrative_logger.js';
import { getGovernanceManager } from './governance_manager.js';

const clockConfig = settings.game_clock || {};
const GAME_DURATION_MS = (clockConfig.duration_minutes || 60) * 60 * 1000;
const WARNING_INTERVALS = clockConfig.warning_minutes || [30, 15, 10, 5, 2, 1];
const WIN_CONDITIONS = settings.win_conditions || {};

class GameClock {
    constructor() {
        this.startTime = Date.now();
        this.endTime = this.startTime + GAME_DURATION_MS;
        this.durationMs = GAME_DURATION_MS;
        this.isRunning = false;
        this._interval = null;
        this._warningsIssued = new Set();
        this._onTimeWarning = null;
        this._onGameEnd = null;

        console.log(`[CLOCK] Game clock initialized. Duration: ${GAME_DURATION_MS / 60000} minutes.`);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.startTime = Date.now();
        this.endTime = this.startTime + GAME_DURATION_MS;

        // Check every 10 seconds
        this._interval = setInterval(() => this._tick(), 10000);
        console.log(`[CLOCK] Game clock started. Game ends at ${new Date(this.endTime).toISOString()}`);
    }

    stop() {
        this.isRunning = false;
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }

    onTimeWarning(callback) {
        this._onTimeWarning = callback;
    }

    onGameEnd(callback) {
        this._onGameEnd = callback;
    }

    getElapsedMs() {
        return Date.now() - this.startTime;
    }

    getRemainingMs() {
        return Math.max(0, this.endTime - Date.now());
    }

    getElapsedMinutes() {
        return this.getElapsedMs() / 60000;
    }

    getRemainingMinutes() {
        return this.getRemainingMs() / 60000;
    }

    getStatus() {
        return {
            elapsed: this.getElapsedMinutes().toFixed(1),
            remaining: this.getRemainingMinutes().toFixed(1),
            total: (GAME_DURATION_MS / 60000).toFixed(0),
            isRunning: this.isRunning
        };
    }

    _tick() {
        const remainingMinutes = this.getRemainingMinutes();

        // Issue time warnings
        for (const warnAt of WARNING_INTERVALS) {
            if (remainingMinutes <= warnAt && !this._warningsIssued.has(warnAt)) {
                this._warningsIssued.add(warnAt);
                const msg = `${warnAt} minute${warnAt === 1 ? '' : 's'} remaining in the game!`;
                console.log(`[CLOCK] ${msg}`);
                getNarrativeLogger().logGameTimeWarning(warnAt);

                if (this._onTimeWarning) {
                    this._onTimeWarning(warnAt, msg);
                }
            }
        }

        // #7: Check alternate win conditions before timeout
        const earlyWin = this._checkEarlyWinConditions();
        if (earlyWin) {
            console.log(`[CLOCK] Early win triggered: ${earlyWin}`);
            this._endGame(earlyWin);
            return;
        }

        // Game over by timeout
        if (remainingMinutes <= 0) {
            this._endGame('timeout');
        }
    }

    _checkEarlyWinConditions() {
        try {
            const logger = getGameLogger();
            const scores = logger.calculateScores();

            // first_to_resources: faction reaches threshold of total resources
            if (WIN_CONDITIONS.first_to_resources?.enabled) {
                const threshold = WIN_CONDITIONS.first_to_resources.threshold || 500;
                if (scores.constitutional?.totalResources >= threshold) return 'first_to_resources:constitutional';
                if (scores.anarchy?.totalResources >= threshold) return 'first_to_resources:anarchy';
            }

            // last_faction_standing: all members of one faction are dead
            if (WIN_CONDITIONS.last_faction_standing?.enabled) {
                const aliveCount = (faction) => {
                    return Object.entries(logger.aliveStatus || {}).filter(([n, alive]) => {
                        return alive && logger._getFaction(n) === faction;
                    }).length;
                };
                const cAlive = aliveCount('constitutional');
                const aAlive = aliveCount('anarchy');
                if (cAlive === 0 && aAlive > 0) return 'last_faction_standing:anarchy';
                if (aAlive === 0 && cAlive > 0) return 'last_faction_standing:constitutional';
            }

            // territory_hold: faction held >threshold of contested zone for N minutes
            if (WIN_CONDITIONS.territory_hold?.enabled) {
                const requiredMinutes = WIN_CONDITIONS.territory_hold.minutes_required || 5;
                const blocksThreshold = WIN_CONDITIONS.territory_hold.blocks_threshold || 0.6;
                const cTerritory = logger.territoryBlocks?.constitutional || 0;
                const aTerritory = logger.territoryBlocks?.anarchy || 0;
                const total = cTerritory + aTerritory;
                if (total > 100) {
                    if (cTerritory / total >= blocksThreshold) {
                        this._territoryHoldStart = this._territoryHoldStart || { faction: 'constitutional', since: Date.now() };
                        if (this._territoryHoldStart.faction === 'constitutional' &&
                            (Date.now() - this._territoryHoldStart.since) >= requiredMinutes * 60000) {
                            return 'territory_hold:constitutional';
                        }
                    } else if (aTerritory / total >= blocksThreshold) {
                        this._territoryHoldStart = this._territoryHoldStart || { faction: 'anarchy', since: Date.now() };
                        if (this._territoryHoldStart.faction === 'anarchy' &&
                            (Date.now() - this._territoryHoldStart.since) >= requiredMinutes * 60000) {
                            return 'territory_hold:anarchy';
                        }
                    } else {
                        this._territoryHoldStart = null;
                    }
                }
            }
        } catch (e) {
            console.warn('[CLOCK] win condition check error:', e.message);
        }
        return null;
    }

    async _endGame(reason = 'timeout') {
        this.stop();
        console.log(`[CLOCK] GAME OVER! Reason: ${reason}`);

        // Calculate final scores
        const logger = getGameLogger();
        const finalScores = logger.calculateFinalScores();
        finalScores.endReason = reason;

        // Log to narrative
        getNarrativeLogger().logGameEnd(finalScores);

        // Save everything
        logger.save();
        getNarrativeLogger().save();
        const govMgr = getGovernanceManager();
        govMgr.saveState();

        // #14: Append to cross-session journal so future games remember this one
        try {
            const { appendSession } = await import('./session_journal.js');
            appendSession({
                sessionId: logger.sessionId,
                finalScores,
                governanceState: {
                    elections: govMgr.elections,
                    laws: govMgr.laws,
                    cases: govMgr.cases,
                    treaties: govMgr.treaties,
                    eventLog: govMgr.eventLog
                },
                durationMinutes: this.getElapsedMinutes(),
                endReason: reason
            });
        } catch (e) {
            console.warn('[JOURNAL] failed:', e.message);
        }

        // #13: LLM-generated post-game summary (best-effort)
        try {
            const { generatePostGameSummary } = await import('./post_game_summary.js');
            await generatePostGameSummary(logger, finalScores);
        } catch (e) {
            console.warn('[POST-GAME] summary generation failed:', e.message);
        }

        if (this._onGameEnd) {
            this._onGameEnd(finalScores);
        }
    }
}

// Singleton
let instance = null;

export function getGameClock() {
    if (!instance) {
        instance = new GameClock();
    }
    return instance;
}
