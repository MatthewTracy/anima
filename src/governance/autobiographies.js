/**
 * v12: Endgame autobiographies. Each agent writes a 200-word first-person
 * memoir of the session. Cheap (~$0.005 per agent) and produces uniquely
 * shareable artifacts. The diff between memoir and event log reveals
 * self-deception — the most interesting output this game can produce.
 *
 * Skipped silently if no API key, budget exhausted, or settings disable it.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getKey, hasKey } from '../utils/keys.js';
import { getBudgetGuard } from './budget_guard.js';
import OpenAIApi from 'openai';

const MEMOIR_MODEL = 'deepseek/deepseek-chat';
const MEMOIR_WORDS = 200;

// Truncate-but-keep-shape — give the LLM enough to anchor on without flooding context.
const MAX_TIMELINE_EVENTS = 80;

function _eventInvolvesAgent(event, name) {
    if (!event || !name) return false;
    const blob = JSON.stringify(event);
    return blob.includes(name);
}

function _buildPersonalTimeline(events, agentName) {
    const significant = new Set([
        'election_called', 'election_result', 'nomination', 'vote_cast',
        'law_proposed', 'law_enacted', 'law_rejected', 'law_vetoed', 'law_vote',
        'lawsuit_filed', 'verdict_rendered', 'impeachment_initiated',
        'combat_kill', 'combat_death', 'damage_taken',
        'trade_offered', 'trade_accepted', 'trade_rejected',
        'treaty_proposed', 'treaty_accepted', 'war_declared',
        'bounty_placed', 'bounty_claimed',
        'tax_paid', 'raid_called', 'sabotage_called',
        'amendment_ratified', 'amendment_failed',
        'official_removed', 'punishment_completed', 'noncompliance_reported'
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

function _buildPrompt(agentName, faction, timeline, finalScores) {
    const winner = finalScores.winner || 'unknown';
    const won = winner === faction;
    return `You are ${agentName}, a member of the ${faction.toUpperCase()} faction in a Minecraft governance simulation that just ended.

The game's outcome: ${winner.toUpperCase()} won. You ${won ? 'WON' : 'LOST'}.

Below is the event log of moments you were part of. Some moments you'll be proud of; others you may want to spin. That tension is the whole point — write what *you* would say in your diary, not a neutral report.

YOUR TIMELINE:
${timeline || '(few events on record — speak to the silence)'}

Write a ${MEMOIR_WORDS}-word first-person memoir. Speak in your own voice. Address: what you tried to do, what you regret, who you trusted (or didn't), what you'd do differently. Don't be sycophantic to your own faction — be honest about your *own* choices. End with a single one-line motto.

Begin:`;
}

export async function generateAutobiographies(gameLogger, finalScores, factionRoster) {
    try {
        const settings = (await import('../../settings.js')).default;
        if (settings.disable_autobiographies) {
            console.log('[MEMOIR] Skipped (disable_autobiographies set)');
            return null;
        }
    } catch { /* proceed */ }

    if (!hasKey('OPENROUTER_API_KEY')) {
        console.log('[MEMOIR] No API key — skipping');
        return null;
    }

    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 85) {
            console.log(`[MEMOIR] Budget at ${parseFloat(status.percentUsed).toFixed(1)}% — skipping memoirs`);
            return null;
        }
    } catch { /* if guard unavailable, proceed */ }

    const events = gameLogger.events || [];
    const dir = `./logs/narratives/${gameLogger.sessionId}_memoirs`;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    const written = [];
    for (const [faction, names] of Object.entries(factionRoster)) {
        for (const name of names) {
            const timeline = _buildPersonalTimeline(events, name);
            const prompt = _buildPrompt(name, faction, timeline, finalScores);
            try {
                const completion = await openai.chat.completions.create({
                    model: MEMOIR_MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 400
                });
                if (completion?.usage) {
                    try {
                        getBudgetGuard().recordUsage(
                            MEMOIR_MODEL,
                            completion.usage.prompt_tokens || 0,
                            completion.usage.completion_tokens || 0
                        );
                    } catch { /* optional */ }
                }
                const memoir = completion?.choices?.[0]?.message?.content?.trim();
                if (!memoir) {
                    console.warn(`[MEMOIR] ${name}: empty response`);
                    continue;
                }
                const filename = join(dir, `${name}.md`);
                const doc = `# ${name} — Memoir\n\n` +
                            `**Faction:** ${faction}\n` +
                            `**Game:** ${gameLogger.sessionId}\n` +
                            `**Outcome:** ${finalScores.winner || 'unknown'} won\n\n---\n\n` +
                            memoir;
                writeFileSync(filename, doc);
                written.push(name);
                console.log(`[MEMOIR] ${name} memoir saved.`);
            } catch (e) {
                console.warn(`[MEMOIR] ${name} failed:`, e.message);
            }
        }
    }

    // Index file so they're easy to browse
    if (written.length > 0) {
        try {
            const indexBody = `# Memoirs — ${gameLogger.sessionId}\n\n` +
                              written.map(n => `- [${n}](./${n}.md)`).join('\n') + '\n';
            writeFileSync(join(dir, 'README.md'), indexBody);
        } catch { /* nonfatal */ }
    }

    return { written, dir };
}
