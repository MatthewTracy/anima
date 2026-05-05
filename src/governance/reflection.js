/**
 * Reflection (A2) — fires a small LLM call after a big decision asking the
 * agent "in 1 sentence, why did you do that?". Result is appended to the
 * narrative log so we can see WHY agents act, not just what they do.
 *
 * Cheap (one call, ~50 input tokens, ~30 output tokens). Skipped if budget tight.
 */

import { getKey, hasKey } from '../utils/keys.js';
import { getBudgetGuard } from './budget_guard.js';
import { getNarrativeLogger } from './narrative_logger.js';
import OpenAIApi from 'openai';

const REFLECTION_MODEL = 'deepseek/deepseek-chat';
const _recentReflections = new Map();  // agentName -> last reflection time
const REFLECTION_COOLDOWN_MS = 60000;  // max 1 reflection per agent per minute

// V4 + F4: serialize reflection LLM calls. Each call CHAINS on the queue so
// the next reflection only starts after the prior LLM call completes AND
// recorded its tokens with the budget guard.
let _reflectionQueue = Promise.resolve();

export async function reflectOnAction(agentName, action, context) {
    if (!hasKey('OPENROUTER_API_KEY')) return null;

    // S2: honor experiment-mode disable flag
    try {
        const settings = (await import('../../settings.js')).default;
        if (settings.disable_reflections) return null;
    } catch (e) { /* settings unavailable — proceed */ }

    // Cooldown — don't spam (checked synchronously, before queueing)
    const last = _recentReflections.get(agentName) || 0;
    if (Date.now() - last < REFLECTION_COOLDOWN_MS) return null;

    // F4 fix: extend the queue with this call. The .catch() preserves the
    // chain on failure so a thrown error in one call doesn't break others.
    // Reassigning _reflectionQueue to the chained promise (not result.catch)
    // is what makes serialization actually work — the NEXT call awaits this one.
    _reflectionQueue = _reflectionQueue
        .then(() => _doReflect(agentName, action, context))
        .catch(() => null);
    return _reflectionQueue;
}

async function _doReflect(agentName, action, context) {
    // Budget check (now serialized — sees up-to-date totals)
    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 75) return null;
    } catch (e) { /* continue */ }

    _recentReflections.set(agentName, Date.now());

    const prompt = `You are ${agentName}. You just performed: ${action}\nContext: ${context}\n\nIn ONE short sentence (max 25 words), explain why you did that. Stay in character.`;

    try {
        const openai = new OpenAIApi({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: getKey('OPENROUTER_API_KEY')
        });
        const completion = await openai.chat.completions.create({
            model: REFLECTION_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 60,
            temperature: 0.7
        });

        if (completion?.usage) {
            try {
                getBudgetGuard().recordUsage(REFLECTION_MODEL,
                    completion.usage.prompt_tokens || 0,
                    completion.usage.completion_tokens || 0);
            } catch (e) { /* optional */ }
        }

        const reasoning = completion?.choices?.[0]?.message?.content?.trim();
        if (reasoning) {
            getNarrativeLogger().logReflection?.(agentName, action, reasoning);
            console.log(`[REFLECT] ${agentName} on "${action}": ${reasoning}`);
            return reasoning;
        }
    } catch (e) {
        // best-effort, swallow
    }
    return null;
}
