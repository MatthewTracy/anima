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

        // Game over
        if (remainingMinutes <= 0) {
            this._endGame();
        }
    }

    _endGame() {
        this.stop();
        console.log('[CLOCK] GAME OVER!');

        // Calculate final scores
        const logger = getGameLogger();
        const finalScores = logger.calculateFinalScores();

        // Log to narrative
        getNarrativeLogger().logGameEnd(finalScores);

        // Save everything
        logger.save();
        getNarrativeLogger().save();
        getGovernanceManager().saveState();

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
