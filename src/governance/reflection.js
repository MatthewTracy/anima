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

export async function reflectOnAction(agentName, action, context) {
    if (!hasKey('OPENROUTER_API_KEY')) return null;

    // Cooldown — don't spam
    const last = _recentReflections.get(agentName) || 0;
    if (Date.now() - last < REFLECTION_COOLDOWN_MS) return null;

    // Budget check
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
