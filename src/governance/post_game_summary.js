/**
 * Post-Game Summary - Uses an LLM to generate a narrative recap from the
 * raw event log. Saved to logs/narratives/<sessionId>_summary.md.
 *
 * Cheap call (one prompt, ~500 output tokens). Skipped silently if API fails.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getKey, hasKey } from '../utils/keys.js';
import { getBudgetGuard } from './budget_guard.js';
import OpenAIApi from 'openai';

const SUMMARY_MODEL = 'deepseek/deepseek-chat';

export async function generatePostGameSummary(gameLogger, finalScores) {
    if (!hasKey('OPENROUTER_API_KEY')) {
        console.log('[POST-GAME] No API key — skipping LLM summary');
        return null;
    }

    // B7: Skip summary if we're already over 80% of session budget — don't blow past cap.
    try {
        const budget = getBudgetGuard();
        const status = budget.getStatus();
        if (parseFloat(status.percentUsed) > 80) {
            console.log(`[POST-GAME] Budget at ${status.percentUsed}% — skipping LLM summary to avoid cap overrun`);
            return null;
        }
    } catch (e) { /* if budget guard fails, continue */ }

    const events = gameLogger.events || [];

    // Filter to interesting events (skip inventory snapshots and chats)
    const significantTypes = new Set([
        'election_called', 'election_result', 'nomination', 'vote_cast',
        'law_proposed', 'law_enacted', 'law_rejected', 'law_vetoed',
        'lawsuit_filed', 'verdict_rendered', 'impeachment_initiated',
        'combat_kill', 'combat_death', 'damage_taken', 'combat_engaged',
        'trade_offered', 'trade_accepted',
        'treaty_proposed', 'treaty_accepted', 'war_declared',
        'bounty_placed', 'bounty_claimed',
        'tax_paid', 'raid_called', 'sabotage_called',
        'amendment_ratified', 'amendment_failed',
        'term_expired', 'punishment_completed', 'noncompliance_reported'
    ]);
    const significant = events.filter(e => significantTypes.has(e.type));

    // Build a compact event timeline
    const timeline = significant.slice(0, 200).map(e => {
        const min = (e.elapsed_ms / 60000).toFixed(1);
        const summary = JSON.stringify(e, (k, v) => {
            if (k === 'time' || k === 'timestamp' || k === 'elapsed_ms') return undefined;
            return v;
        }).slice(0, 200);
        return `[${min}m] ${summary}`;
    }).join('\n');

    const constScore = finalScores.constitutional?.weightedTotal?.toFixed(1) || '?';
    const anarchyScore = finalScores.anarchy?.weightedTotal?.toFixed(1) || '?';
    const winner = finalScores.winner || 'unknown';
    const reason = finalScores.endReason || 'timeout';

    const prompt = `You are a narrative game journalist. Write a vivid 4-paragraph post-game recap of this Governance Game session. Capture the drama, key moments, and personalities. Use markdown headers. Final paragraph: explain WHY the winner won.

GAME RESULT
- Winner: ${winner}
- End reason: ${reason}
- Constitutional score: ${constScore}
- Anarchy score: ${anarchyScore}

KEY EVENTS (chronological):
${timeline}

Write the recap now (markdown, ~400 words):`;

    try {
        const openai = new OpenAIApi({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: getKey('OPENROUTER_API_KEY')
        });

        console.log('[POST-GAME] Generating LLM summary...');
        const completion = await openai.chat.completions.create({
            model: SUMMARY_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 800
        });

        // B7: Record usage so the post-game call counts against budget cap
        if (completion?.usage) {
            try {
                getBudgetGuard().recordUsage(
                    SUMMARY_MODEL,
                    completion.usage.prompt_tokens || 0,
                    completion.usage.completion_tokens || 0
                );
            } catch (e) { /* optional */ }
        }

        const summary = completion?.choices?.[0]?.message?.content;
        if (!summary) {
            console.warn('[POST-GAME] empty summary returned');
            return null;
        }

        // Save to disk
        const dir = './logs/narratives';
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const filename = join(dir, `${gameLogger.sessionId}_summary.md`);
        const fullDoc = `# Post-Game Recap — ${gameLogger.sessionId}\n\n` +
                        `**Result:** ${winner.toUpperCase()} wins (${reason})\n` +
                        `**Constitutional:** ${constScore} | **Anarchy:** ${anarchyScore}\n\n---\n\n` +
                        summary;
        writeFileSync(filename, fullDoc);
        console.log(`[POST-GAME] Summary saved to ${filename}`);
        return summary;
    } catch (e) {
        console.warn('[POST-GAME] LLM call failed:', e.message);
        return null;
    }
}
