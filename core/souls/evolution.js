/**
 * Soul Evolution — at the end of every game, each surviving agent rewrites
 * their own soul based on the events they were part of. Locked (dead) souls
 * are skipped. One LLM call per surviving agent (~$0.005 each).
 *
 * This is the moment where character development happens. If souls evolve
 * into mush, this prompt is the first place to look.
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Soul } from './soul.js';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';
import OpenAIApi from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(__dirname, 'templates', 'evolution_prompt.md');
const MODEL = 'deepseek/deepseek-chat';
const MAX_TIMELINE_EVENTS = 60;

function _eventInvolvesAgent(event, name) {
    if (!event || !name) return false;
    return JSON.stringify(event).includes(name);
}

function _buildPersonalTimeline(events, agentName) {
    const significant = new Set([
        'election_called', 'election_result', 'nomination', 'vote_cast',
        'law_proposed', 'law_enacted', 'law_rejected', 'law_vetoed', 'law_vote', 'law_as_code',
        'lawsuit_filed', 'verdict_rendered', 'impeachment_initiated',
        'combat_kill', 'combat_death', 'damage_taken',
        'trade_offered', 'trade_accepted', 'trade_rejected',
        'treaty_proposed', 'treaty_accepted', 'war_declared',
        'bounty_placed', 'bounty_claimed',
        'tax_paid', 'raid_called', 'sabotage_called',
        'amendment_ratified', 'amendment_failed',
        'official_removed', 'punishment_completed', 'noncompliance_reported',
        'witness_action'
    ]);
    const filtered = events
        .filter(e => significant.has(e.type) && _eventInvolvesAgent(e, agentName))
        .slice(-MAX_TIMELINE_EVENTS);
    return filtered.map(e => {
        const min = (e.elapsed_ms / 60000).toFixed(1);
        const compact = JSON.stringify(e, (k, v) => {
            if (k === 'time' || k === 'timestamp' || k === 'elapsed_ms') return undefined;
            return v;
        }).slice(0, 180);
        return `[${min}m] ${compact}`;
    }).join('\n');
}

/**
 * Evolve one agent's soul. Returns true on success, false if skipped.
 */
async function _evolveOne(agentName, events, openai) {
    const soul = new Soul(agentName);
    if (soul.isLocked()) {
        console.log(`[EVOLVE] ${agentName}: locked, skipping.`);
        return false;
    }
    const priorSoul = soul.read();
    if (!priorSoul) {
        console.log(`[EVOLVE] ${agentName}: no prior soul to evolve, skipping. (Should have been seeded at spawn.)`);
        return false;
    }
    const timeline = _buildPersonalTimeline(events, agentName);
    const promptTemplate = readFileSync(PROMPT_PATH, 'utf8');
    const prompt = promptTemplate
        .replaceAll('{{name}}', agentName)
        .replaceAll('{{prior_soul}}', priorSoul.trim())
        .replaceAll('{{event_timeline}}', timeline || '(few events on record — speak to the silence)');

    try {
        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 900
        });
        if (completion?.usage) {
            try {
                getBudgetGuard().recordUsage(MODEL, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0);
            } catch { /* optional */ }
        }
        const newSoul = completion?.choices?.[0]?.message?.content?.trim();
        if (!newSoul) {
            console.warn(`[EVOLVE] ${agentName}: empty response, soul unchanged.`);
            return false;
        }
        // Strip any preamble the LLM might have added before the first heading
        const firstHeading = newSoul.indexOf('# ');
        const cleaned = firstHeading >= 0 ? newSoul.slice(firstHeading) : newSoul;
        soul.save(cleaned);
        console.log(`[EVOLVE] ${agentName}: soul updated (${cleaned.length} chars).`);
        return true;
    } catch (e) {
        console.warn(`[EVOLVE] ${agentName}: LLM call failed — ${e.message}`);
        return false;
    }
}

/**
 * Evolve all surviving agents' souls at game end.
 *
 * @param {Object} gameLogger - the game logger holding the event stream
 * @param {string[]} roster - all agent names who participated this game
 * @returns {Promise<{evolved: string[], skipped: string[]}>}
 */
export async function evolveAllSouls(gameLogger, roster) {
    try {
        const settings = (await import('../../settings.js')).default;
        if (settings.disable_soul_evolution) {
            console.log('[EVOLVE] Skipped (disable_soul_evolution set).');
            return { evolved: [], skipped: roster };
        }
    } catch { /* proceed */ }

    if (!hasKey('OPENROUTER_API_KEY')) {
        console.log('[EVOLVE] No API key — skipping soul evolution.');
        return { evolved: [], skipped: roster };
    }

    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 90) {
            console.log(`[EVOLVE] Budget at ${parseFloat(status.percentUsed).toFixed(1)}% — skipping evolution to stay under cap.`);
            return { evolved: [], skipped: roster };
        }
    } catch { /* if guard unavailable, proceed */ }

    const events = gameLogger?.events || [];
    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    const evolved = [];
    const skipped = [];
    for (const name of roster || []) {
        const ok = await _evolveOne(name, events, openai);
        (ok ? evolved : skipped).push(name);
    }

    console.log(`[EVOLVE] Complete. Evolved: ${evolved.length}, skipped: ${skipped.length}.`);
    return { evolved, skipped };
}
