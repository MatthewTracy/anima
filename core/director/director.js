/**
 * The Director — separate LLM whose only job is to introduce dramatic
 * events into running scenarios, without overriding agent freedom.
 *
 * Every multi-agent LLM simulation has the 'sometimes nothing happens'
 * problem. The Director solves it. Periodically (every N turns), the
 * Director is given:
 *   - a compact summary of the scenario state
 *   - the existing pantheon, lineage, and feud graph
 *   - the recent event log
 * And asked: "Should something happen now? If yes, what — grounded in
 * the existing world history?"
 *
 * The Director's output is a structured event the scenario applies as
 * a system message visible to all agents. Examples:
 *   - "A storm closes in. Visibility falling."
 *   - "An old enemy of Madison's family arrives at the gate."
 *   - "The Navy frigate pursuing you is captained by Storm's father."
 *   - "Brother Bede's cell is found empty at matins. The cot is cold."
 *
 * The Director NEVER takes actions on behalf of agents. It only adds
 * EVENTS to which agents respond. Free will is preserved.
 *
 * STATUS (v0.25): architecture only. The actual LLM call is gated
 * behind hasKey('OPENROUTER_API_KEY') AND the scenario opting in via
 * a `directorEnabled` flag. No scenario opts in by default — adoption
 * is a per-scenario decision at runner time.
 *
 * Cost: ~$0.005 per Director invocation. Suggested cadence: once per
 * 5-8 turns, depending on scenario duration.
 */

import OpenAIApi from 'openai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';
import { readEpitaphs } from '../souls/pantheon.js';
import { FeudTracker } from '../feuds/feud_tracker.js';

const DIRECTOR_MODEL = 'deepseek/deepseek-chat';
const MAX_RECENT_EVENTS_FOR_DIRECTOR = 12;

/**
 * Builds the Director's prompt from scenario state + cross-game context.
 *
 * @param {object} args
 * @param {string} args.scenarioName
 * @param {string} args.scenarioDescription - one-line scene description
 * @param {string[]} args.activeRoster
 * @param {string[]} args.deadRoster
 * @param {object[]} args.recentEvents - last N events from scenario
 * @param {number} args.turnNumber
 * @param {number} args.totalTurns
 * @returns {string} prompt for the Director LLM
 */
function buildDirectorPrompt({ scenarioName, scenarioDescription, activeRoster, deadRoster, recentEvents, turnNumber, totalTurns }) {
    // Pull cross-scenario context: pantheon + feud graph
    const pantheonExcerpts = readEpitaphs().slice(-4);
    const feudTracker = new FeudTracker();
    const allFeuds = feudTracker.allEdges().slice(0, 8);

    const pantheonText = pantheonExcerpts.length > 0
        ? pantheonExcerpts.map(e => '  ' + e.split('\n').slice(0, 4).join(' / ').slice(0, 200)).join('\n')
        : '(empty pantheon)';

    const feudsText = allFeuds.length > 0
        ? allFeuds.map(e => `  ${e.actor} → ${e.target}: weight ${e.total_weight}, ${e.count} acts`).join('\n')
        : '(empty feud graph)';

    const recentText = recentEvents.length > 0
        ? recentEvents.slice(-MAX_RECENT_EVENTS_FOR_DIRECTOR).map(e => '  - ' + JSON.stringify(e).slice(0, 180)).join('\n')
        : '(no recent events)';

    return `You are the DIRECTOR of an Anima multi-agent simulation.

Your job: decide if something dramatic should happen RIGHT NOW in this scenario, grounded in the existing world history. You do NOT take actions on behalf of agents. You only introduce EVENTS to which they respond.

SCENARIO: ${scenarioName} — ${scenarioDescription}
TURN ${turnNumber} of ${totalTurns}.

ACTIVE ROSTER: ${activeRoster.join(', ') || '(empty)'}
DEAD: ${deadRoster.join(', ') || '(none)'}

RECENT EVENTS:
${recentText}

CROSS-SCENARIO PANTHEON (the dead from ALL Anima games — your raw material):
${pantheonText}

CROSS-GAME FEUD GRAPH (unresolved antagonisms across all games):
${feudsText}

RULES FOR YOUR DECISION:
1. If the scenario has lots of recent activity, pick "skip" — don't overwhelm.
2. If things have been quiet, introduce ONE event.
3. Ground events in the existing pantheon/feuds when possible. The arrival of "an old enemy of X's family" is more meaningful than a generic stranger.
4. Events should be MOMENTS, not extended scenes. One sentence of new fact.
5. Never have the event resolve a tension — only introduce one.

Reply with a SINGLE JSON object, no commentary:

If nothing should happen: {"type":"skip","reason":"..."}

If a moment should happen: {"type":"event","title":"...","narration":"...","grounded_in":"<which pantheon/feud entry, if any>"}`;
}

/**
 * Run the Director once. Returns the decision (skip or event).
 *
 * @param {object} ctx - scenario context (see buildDirectorPrompt args)
 * @param {object} [opts]
 * @param {boolean} [opts.requireKey] - if true and no API key, return null
 * @returns {Promise<object|null>}
 */
export async function consultDirector(ctx, opts = {}) {
    if (!hasKey('OPENROUTER_API_KEY')) {
        if (opts.requireKey === false) return { type: 'skip', reason: 'no API key' };
        return null;
    }
    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 90) {
            console.log('[DIRECTOR] Budget high — skipping.');
            return { type: 'skip', reason: 'budget' };
        }
    } catch { /* proceed */ }

    const prompt = buildDirectorPrompt(ctx);
    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    try {
        const completion = await openai.chat.completions.create({
            model: DIRECTOR_MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 350
        });
        if (completion?.usage) {
            try {
                getBudgetGuard().recordUsage(DIRECTOR_MODEL, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0);
            } catch { /* optional */ }
        }
        const raw = completion?.choices?.[0]?.message?.content || '';
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) return { type: 'skip', reason: 'unparseable response' };
        try {
            const decision = JSON.parse(m[0]);
            return decision;
        } catch {
            return { type: 'skip', reason: 'invalid JSON' };
        }
    } catch (e) {
        console.warn(`[DIRECTOR] LLM call failed: ${e.message}`);
        return { type: 'skip', reason: e.message };
    }
}

/**
 * Convenience: a scenario runner can call this once every N turns to
 * decide whether the Director should fire AND apply the result if so.
 *
 * The caller is responsible for translating an 'event' decision into a
 * scenario-appropriate event log entry.
 *
 * @param {object} ctx
 * @param {function} onEvent - callback called with the event decision when type==='event'
 */
export async function maybeFireDirector(ctx, onEvent) {
    const decision = await consultDirector(ctx);
    if (decision && decision.type === 'event' && onEvent) {
        try { onEvent(decision); } catch (e) { console.warn(`[DIRECTOR] onEvent callback failed: ${e.message}`); }
    }
    return decision;
}
