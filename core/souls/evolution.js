/**
 * Soul Evolution — at the end of every game, each surviving agent rewrites
 * their own soul based on the events they were part of. Locked (dead) souls
 * are skipped. One LLM call per surviving agent (~$0.005 each).
 *
 * This is the moment where character development happens. If souls evolve
 * into mush, this prompt is the first place to look.
 *
 * v0.15: synthesis layer. Evolution now reads ALL the primitives an agent
 * has accumulated during the game — BeliefTable, RecursiveBeliefTable,
 * Burden, CommitmentLedger, memoir — and weaves them into the soul rewrite.
 * Without this, the primitives were runtime decoration with no long-term
 * effect on character. With it, everything an agent learned, felt, and
 * hid this game becomes part of who they are next game.
 */

import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Soul } from './soul.js';
import { BeliefTable } from '../beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../beliefs/recursive_belief.js';
import { Burden } from '../burdens/burden.js';
import { AffectLog } from '../affect/affect.js';
import { consolidate, asPromptText as consolidatedAsPromptText } from '../affect/consolidation.js';
import { asPromptText as stressAsPromptText } from '../cognition/allostatic_load.js';
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
 * v0.15: format the agent's BeliefTable for prompt input. Caps at top-3
 * highest-magnitude beliefs (most positive AND most negative trust).
 */
function _formatBeliefsForPrompt(agentName) {
    try {
        const ranked = new BeliefTable(agentName).rankedTargets();
        if (ranked.length === 0) return '(no beliefs formed yet)';
        // Pick by absolute magnitude — strongest opinions on either side
        const sorted = ranked.slice().sort((a, b) => Math.abs(b.trust) - Math.abs(a.trust));
        const top = sorted.slice(0, 3);
        return top.map(t => {
            const sign = t.trust > 0 ? '+' : '';
            const recent = t.evidence?.length > 0 ? ` (because: ${t.evidence[t.evidence.length - 1].reason})` : '';
            return `- ${t.name}: trust ${sign}${t.trust.toFixed(2)}${recent}`;
        }).join('\n');
    } catch {
        return '(no beliefs available)';
    }
}

/**
 * v0.15: format the agent's RecursiveBeliefTable. Top-3 reflections.
 */
function _formatReflectionsForPrompt(agentName) {
    try {
        const ranked = new RecursiveBeliefTable(agentName).rankedPerceptions();
        if (ranked.length === 0) return '(no reflections formed yet)';
        const sorted = ranked.slice().sort((a, b) => Math.abs(b.perceived_trust_of_me) - Math.abs(a.perceived_trust_of_me));
        const top = sorted.slice(0, 3);
        return top.map(r => {
            const sign = r.perceived_trust_of_me > 0 ? '+' : '';
            const conf = r.confidence >= 0.5 ? 'I believe' : 'I suspect';
            const recent = r.evidence?.length > 0 ? ` (because: ${r.evidence[r.evidence.length - 1].reason})` : '';
            return `- ${conf} ${r.name} sees me at ${sign}${r.perceived_trust_of_me.toFixed(2)}${recent}`;
        }).join('\n');
    } catch {
        return '(no reflections available)';
    }
}

/**
 * v0.15: format the agent's burden. Empty string if none — keeps the
 * prompt clean for agents who carry no secret.
 */
// v0.45: affect summary — what FELT most charged this game, ranked by
// amygdala-style |valence| × arousal. The synthesis prompt prioritizes
// these over banal events. Models how real memory consolidation works:
// emotional moments survive; flat ones fade.
function _formatAffectForPrompt(agentName) {
    try {
        const log = new AffectLog(agentName);
        const mood = log.currentMood();
        const top = log.topMoments(5);
        if (top.length === 0) return '(felt state: settled, no charged moments)';
        const lines = [];
        lines.push(`Final mood: ${mood.label} (valence ${mood.valence > 0 ? '+' : ''}${mood.valence.toFixed(2)}, arousal ${mood.arousal.toFixed(2)})`);
        lines.push('Most-charged moments — these should weigh MOST in your scars / what-I-have-learned:');
        for (const m of top) {
            const sign = m.valence > 0 ? '+' : '';
            lines.push(`  - [${sign}${m.valence.toFixed(2)}/${m.arousal.toFixed(2)}] ${m.type}${m.actor ? ' by ' + m.actor : ''}${m.target ? ' on ' + m.target : ''}`);
        }
        return lines.join('\n');
    } catch {
        return '(felt state unavailable)';
    }
}

/**
 * v0.77: scan the agent's affect log for cognitive dissonance — actions
 * THEY took that felt bad to take. Same fingerprint the DMN uses
 * (v0.74). Returns a prompt section that asks the LLM to reckon with
 * the contradiction during soul rewrite, in Festinger's two-path
 * frame: either change behavior, or rationalize the action into
 * compatibility with values.
 */
function _formatDissonanceForPrompt(agentName) {
    try {
        const log = new AffectLog(agentName);
        const data = log._load();
        const dissonant = data.log.filter(e =>
            e.role === 'actor' && typeof e.valence === 'number' && e.valence < -0.3
        );
        if (dissonant.length === 0) {
            return '(no significant dissonance — your actions sat comfortably with who you took yourself to be)';
        }
        const lines = [];
        lines.push(`You took ${dissonant.length} action${dissonant.length === 1 ? '' : 's'} that felt bad to take. The body remembers them. Festinger's choice now: revise who you are to fit what you did, or revise what you did to fit who you are.`);
        const top = dissonant.slice().sort((a, b) => b.magnitude - a.magnitude).slice(0, 3);
        lines.push('Most-dissonant moments:');
        for (const m of top) {
            lines.push(`  - [v${m.valence.toFixed(2)}/a${m.arousal.toFixed(2)}] ${m.type}${m.target ? ' on ' + m.target : ''}`);
        }
        lines.push('In this rewrite, surface the contradiction explicitly — either as a new lesson learned, a new scar, or a recasting of who you understand yourself to be. Do not silently ignore it.');
        return lines.join('\n');
    } catch {
        return '(dissonance unavailable)';
    }
}

function _formatBurdenForPrompt(agentName) {
    try {
        const burdenObj = new Burden(agentName);
        const active = burdenObj.read();
        const confessions = burdenObj.confessions();
        const lines = [];
        if (active) {
            lines.push(`Active (still hidden): [${active.kind?.toUpperCase() || 'SECRET'}] ${active.text}`);
        }
        if (confessions.length > 0) {
            lines.push(`Past confessions (now known to others — fold into "What I have learned"):`);
            for (const c of confessions.slice(-3)) {
                lines.push(`  - ${c.confessedAt?.slice(0, 10)}: [${c.kind?.toUpperCase()}] "${c.text}" — confessed ${c.toAudience}`);
            }
        }
        if (lines.length === 0) return '(no burden carried, no past confessions)';
        return lines.join('\n');
    } catch {
        return '(no burden carried)';
    }
}

/**
 * v0.15: format commitments involving the agent. Pulls from the most
 * recent game's CommitmentLedger if it exists. Caller passes gameId
 * (or we fall back to scanning logs/commitments for any ledger).
 */
function _formatCommitmentsForPrompt(agentName, gameId) {
    try {
        // We don't have direct access to the gameId in evolution.js —
        // try to find ledgers in logs/commitments that include this agent.
        // Best-effort. Most scenarios won't have used commitments yet.
        const path = `./logs/commitments/${gameId || ''}.json`;
        if (gameId && existsSync(path)) {
            const data = JSON.parse(readFileSync(path, 'utf8'));
            const involving = (data.commitments || []).filter(c => c.by === agentName || c.to === agentName);
            if (involving.length === 0) return '(no commitments made or received this game)';
            return involving.map(c => {
                const role = c.by === agentName ? 'I promised' : `${c.by} promised me`;
                return `- ${role} "${c.consequence}" IF "${c.condition}" — ${c.status}${c.resolution ? ' (' + c.resolution + ')' : ''}`;
            }).join('\n');
        }
        return '(no commitments made or received this game)';
    } catch {
        return '(no commitments available)';
    }
}

/**
 * v0.15: read the agent's memoir for THIS game from logs/<scenario>/memoirs/.
 * We don't know the scenario from here, so search broadly. Best-effort.
 */
function _formatMemoirForPrompt(agentName) {
    try {
        const candidates = [
            './logs/cloister/memoirs',
            './logs/outpost/memoirs',
            './logs/crew/memoirs',
            './logs/narratives/memoirs',
        ];
        const today = new Date().toISOString().slice(0, 10);
        for (const dir of candidates) {
            if (!existsSync(dir)) continue;
            const files = readdirSync(dir).filter(f => f.startsWith(`${agentName}_`) && f.includes(today));
            if (files.length > 0) {
                files.sort();
                return readFileSync(join(dir, files[files.length - 1]), 'utf8').slice(0, 1500);
            }
        }
        // Forum's autobiographies live in dated memoir directories
        const narrDir = './logs/narratives';
        if (existsSync(narrDir)) {
            const subdirs = readdirSync(narrDir).filter(d => d.endsWith('_memoirs'));
            // Try the most recent first
            subdirs.sort().reverse();
            for (const sd of subdirs) {
                const fp = join(narrDir, sd, `${agentName}.md`);
                if (existsSync(fp)) return readFileSync(fp, 'utf8').slice(0, 1500);
            }
        }
        return '(no memoir written for this game)';
    } catch {
        return '(no memoir available)';
    }
}

/**
 * Evolve one agent's soul. Returns true on success, false if skipped.
 *
 * v0.15: now reads ALL the primitives — BeliefTable, RecursiveBeliefTable,
 * Burden, CommitmentLedger, memoir — and weaves them into the LLM prompt.
 */
async function _evolveOne(agentName, events, openai, gameId = null) {
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
    const beliefs = _formatBeliefsForPrompt(agentName);
    const reflections = _formatReflectionsForPrompt(agentName);
    const burden = _formatBurdenForPrompt(agentName);
    const commitments = _formatCommitmentsForPrompt(agentName, gameId);
    const memoir = _formatMemoirForPrompt(agentName);
    const affect = _formatAffectForPrompt(agentName);   // v0.45
    const dissonance = _formatDissonanceForPrompt(agentName);  // v0.77

    // v0.46: hippocampus → cortex consolidation. Runs BEFORE evolution.
    // Extracts the most-charged moments, detects recurring themes,
    // composes a deterministic narrative, and appends to the agent's
    // consolidated_memory.md (cortical store). Then clears AffectLog
    // (hippocampal store resets).
    //
    // The evolution prompt now sees BOTH: the freshly-consolidated
    // entry (specific to this game) AND the full consolidated_memory.md
    // (everything that's ever been kept).
    let consolidationEntry = null;
    try {
        consolidationEntry = consolidate(agentName, {
            scenario: gameId || 'unknown',
            clearAffectLog: false   // we read affect AFTER this; don't clear yet
        });
    } catch (e) {
        console.warn(`[EVOLVE] Consolidation skipped for ${agentName}: ${e.message}`);
    }
    const consolidatedHistory = consolidatedAsPromptText(agentName);
    const justConsolidated = consolidationEntry ? consolidationEntry.narrative : '(no consolidation this game)';

    const promptTemplate = readFileSync(PROMPT_PATH, 'utf8');
    const prompt = promptTemplate
        .replaceAll('{{name}}', agentName)
        .replaceAll('{{prior_soul}}', priorSoul.trim())
        .replaceAll('{{event_timeline}}', timeline || '(few events on record — speak to the silence)')
        .replaceAll('{{beliefs}}', beliefs)
        .replaceAll('{{reflections}}', reflections)
        .replaceAll('{{burden}}', burden)
        .replaceAll('{{commitments}}', commitments)
        .replaceAll('{{memoir}}', memoir)
        .replaceAll('{{affect}}', affect)
        .replaceAll('{{just_consolidated}}', justConsolidated)        // v0.46
        .replaceAll('{{consolidated_history}}', consolidatedHistory)  // v0.46
        .replaceAll('{{stress}}', stressAsPromptText(agentName))      // v0.60
        .replaceAll('{{dissonance}}', dissonance);                    // v0.77

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
