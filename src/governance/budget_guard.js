/**
 * BudgetGuard - Tracks API token usage and enforces spending caps.
 * Prevents accidental overspending by killing agents when budget is exceeded.
 *
 * Usage is tracked per-session and persisted to disk for monitoring.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Pricing per million tokens (OpenRouter rates)
const DEFAULT_PRICING = {
    'deepseek/deepseek-chat': { input: 0.30, output: 0.88 },
    'deepseek/deepseek-reasoner': { input: 0.55, output: 2.19 },
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
    'anthropic/claude-opus-4': { input: 15.00, output: 75.00 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
    'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
    'google/gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'google/gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
    'mistralai/mistral-large': { input: 2.00, output: 6.00 },
    'qwen/qwen-2.5-72b-instruct': { input: 0.36, output: 0.40 },
    'default': { input: 0.50, output: 1.00 }
};

class BudgetGuard {
    constructor(options = {}) {
        this.monthlyCapUsd = options.monthlyCapUsd || 25.00;
        this.sessionCapUsd = options.sessionCapUsd || 5.00;
        this.warningThreshold = options.warningThreshold || 0.80; // warn at 80% of cap

        this.sessionStart = Date.now();
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        this.totalCostUsd = 0;
        this.requestCount = 0;
        this.warningIssued = false;

        this.logDir = './logs/budget';
        try {
            if (!existsSync(this.logDir)) {
                mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create budget log directory:', e.message);
        }
    }

    /**
     * Record token usage from an API response.
     * @param {string} model - The model name (e.g., 'deepseek/deepseek-chat')
     * @param {number} inputTokens - Number of input/prompt tokens
     * @param {number} outputTokens - Number of output/completion tokens
     * @returns {{ allowed: boolean, message: string }} Whether to continue or stop
     */
    recordUsage(model, inputTokens, outputTokens) {
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        this.requestCount++;

        const pricing = DEFAULT_PRICING[model] || DEFAULT_PRICING['default'];
        const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
        this.totalCostUsd += cost;

        // Log every 50 requests
        if (this.requestCount % 50 === 0) {
            this._saveUsageLog();
            console.log(`[BUDGET] Session cost: $${this.totalCostUsd.toFixed(4)} | Requests: ${this.requestCount} | Tokens: ${this.totalInputTokens + this.totalOutputTokens}`);
        }

        // Check session cap
        if (this.totalCostUsd >= this.sessionCapUsd) {
            this._saveUsageLog();
            return {
                allowed: false,
                message: `SESSION BUDGET EXCEEDED: $${this.totalCostUsd.toFixed(4)} >= $${this.sessionCapUsd.toFixed(2)} cap. Stopping agents.`
            };
        }

        // Warning threshold
        if (!this.warningIssued && this.totalCostUsd >= this.sessionCapUsd * this.warningThreshold) {
            this.warningIssued = true;
            console.warn(`[BUDGET WARNING] Approaching session cap: $${this.totalCostUsd.toFixed(4)} / $${this.sessionCapUsd.toFixed(2)} (${(this.totalCostUsd / this.sessionCapUsd * 100).toFixed(1)}%)`);
        }

        return { allowed: true, message: 'ok' };
    }

    getStatus() {
        const elapsed = (Date.now() - this.sessionStart) / 1000 / 60; // minutes
        const costPerMinute = elapsed > 0 ? this.totalCostUsd / elapsed : 0;
        // V6: numbers are numbers (not strings). Display formatting belongs in the UI layer.
        return {
            sessionCost: this.totalCostUsd,
            sessionCap: this.sessionCapUsd,
            percentUsed: (this.totalCostUsd / this.sessionCapUsd * 100),
            requestCount: this.requestCount,
            totalTokens: this.totalInputTokens + this.totalOutputTokens,
            costPerMinute,
            elapsedMinutes: elapsed
        };
    }

    _saveUsageLog() {
        try {
            const filename = join(this.logDir, `budget_session_${new Date(this.sessionStart).toISOString().replace(/[:.]/g, '-')}.json`);
            writeFileSync(filename, JSON.stringify({
                sessionStart: new Date(this.sessionStart).toISOString(),
                lastUpdate: new Date().toISOString(),
                totalInputTokens: this.totalInputTokens,
                totalOutputTokens: this.totalOutputTokens,
                totalCostUsd: this.totalCostUsd,
                requestCount: this.requestCount,
                sessionCapUsd: this.sessionCapUsd,
                ...this.getStatus()
            }, null, 2));
        } catch (e) {
            // Silent fail on log write
        }
    }
}

// Singleton — reads settings.budget for caps, falls back to safe defaults.
// F1: previously the singleton ignored settings.budget entirely so
// `--preset experiment`'s $0.50 cap had no effect.
let instance = null;
let _settingsBudget = null;
try {
    // Synchronous import via require-style dynamic eval; ESM dynamic import
    // would force this function async which we don't want for a hot-path check.
    // Settings is a small object — read it lazily on first call instead.
} catch (e) { /* noop */ }

async function _loadSettingsBudget() {
    if (_settingsBudget !== null) return _settingsBudget;
    try {
        const s = (await import('../../settings.js')).default;
        _settingsBudget = s?.budget || {};
    } catch (e) {
        _settingsBudget = {};
    }
    return _settingsBudget;
}

export function getBudgetGuard(options = {}) {
    if (!instance) {
        // Try to read settings.budget synchronously by walking the resolved module if
        // already cached. Fallback to defaults; an async refresh runs after construction.
        instance = new BudgetGuard({
            monthlyCapUsd: options.monthlyCapUsd || 25.00,
            sessionCapUsd: options.sessionCapUsd || 3.00,
            warningThreshold: options.warningThreshold || 0.80
        });
        // Async refresh from settings — applies caps once main.js loads
        _loadSettingsBudget().then(b => {
            if (b.session_cap_usd != null) instance.sessionCapUsd = b.session_cap_usd;
            if (b.monthly_cap_usd != null) instance.monthlyCapUsd = b.monthly_cap_usd;
            if (b.warning_threshold != null) instance.warningThreshold = b.warning_threshold;
            console.log(`[BUDGET] Caps loaded from settings: session=$${instance.sessionCapUsd}, monthly=$${instance.monthlyCapUsd}`);
        }).catch(() => {});
    }
    return instance;
}
