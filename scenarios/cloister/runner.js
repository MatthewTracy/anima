#!/usr/bin/env node
/**
 * Cloister Runner — pure-text Anima scenario orchestrator.
 *
 * No Minecraft, no Docker, no socket.io. Just an LLM loop:
 *   1. Pick next active monk by rotation.
 *   2. Build their prompt: their $SOUL + monastery state + recent events + character flavor.
 *   3. Call LLM, parse the JSON action.
 *   4. Apply to monastery state.
 *   5. Loop until end condition.
 *   6. Write manuscript + soul-evolve survivors + lock dead souls.
 *
 * Usage: npm run cloister
 *        node scenarios/cloister/runner.js
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import OpenAIApi from 'openai';
import { Monastery } from './monastery.js';
import { Soul, rosterAsLegends } from '../../core/souls/soul.js';
import { evolveAllSouls } from '../../core/souls/evolution.js';
import { asPromptText as lineageAsPromptText } from '../../core/souls/lineage.js';
import { asPromptText as pantheonAsPromptText } from '../../core/souls/pantheon.js';
import { BeliefTable } from '../../core/beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../../core/beliefs/recursive_belief.js';
import { Burden } from '../../core/burdens/burden.js';
import { FeudTracker } from '../../core/feuds/feud_tracker.js';
import { applyEventsToBeliefs } from '../../core/beliefs/auto_update.js';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';

const SCENARIO_PATH = './scenarios/cloister/scenario.json';
const CHARACTERS_DIR = './scenarios/cloister/characters';

function loadScenario() {
    return JSON.parse(readFileSync(SCENARIO_PATH, 'utf8'));
}

function loadProfiles(scenario) {
    const profiles = {};
    for (const name of scenario.roster) {
        const path = join(CHARACTERS_DIR, name.toLowerCase() + '.json');
        profiles[name] = JSON.parse(readFileSync(path, 'utf8'));
    }
    return profiles;
}

function seedSoulsIfNeeded(scenario, profiles) {
    for (const name of scenario.roster) {
        const soul = new Soul(name);
        if (!soul.exists() && !soul.isLocked()) {
            const p = profiles[name];
            const motto = (p.system_prompt_prefix.split(/[.!?](\s|$)/)[0] || `I am ${name}.`).trim();
            soul.seed({
                personality_seed: p.system_prompt_prefix,
                starting_motto: motto,
                faction: 'cloister'
            });
            console.log(`[CLOISTER] Seeded soul for ${name}.`);
        } else if (soul.isLocked()) {
            console.warn(`[CLOISTER] ${name} has a locked soul (died in a prior game). Skipping — pick a different name in the roster.`);
        } else {
            console.log(`[CLOISTER] Loaded existing soul for ${name}.`);
        }
    }
}

function buildPrompt(monastery, profile, askingMonkName) {
    const soul = new Soul(askingMonkName);
    const beliefs = new BeliefTable(askingMonkName);
    const reflections = new RecursiveBeliefTable(askingMonkName);
    const burden = new Burden(askingMonkName);
    const monasteryState = monastery.summaryForPrompt(askingMonkName);
    const scriptureExcerpt = monastery.scripture.slice(-1500);

    return `${lineageAsPromptText(askingMonkName)}

${new FeudTracker().asPromptText(askingMonkName)}

${pantheonAsPromptText(2)}

${soul.asPromptText()}

${rosterAsLegends(askingMonkName)}

${beliefs.asPromptText()}

${reflections.asPromptText()}

${burden.asPromptText()}

=== WHO YOU ARE THIS GAME ===
${profile.system_prompt_prefix}

You are ${profile.title}. Your voice: ${profile.voice}.
${profile.secret ? `Your secret (known only to you): ${profile.secret}` : ''}

=== THE MONASTERY ===
${monasteryState}

=== THE SCRIPTURE (last passages) ===
${scriptureExcerpt}

=== YOUR TURN ===
It is turn ${monastery.turn + 1} of ${monastery.config.duration_turns}. The brothers wait.

You may take ONE action. Reply with a single JSON object — no markdown, no commentary, just the JSON. Available actions:

- speak — just say something. {"type":"speak","text":"..."}
- preach — give a sermon (shifts others' doctrine). {"type":"preach","topic":"...","text":"...","orthodox":true|false}
- confess — confess privately to another brother. {"type":"confess","target":"<name>","text":"..."}
- accuse — publicly accuse another brother of sin. {"type":"accuse","target":"<name>","sin":"..."}
- fast — voluntary penance. {"type":"fast","days":<int>}
- writeScripture — add a passage to the canon (persists across games). {"type":"writeScripture","text":"..."}
- vision — Bede only. Share a mystical experience. {"type":"vision","text":"..."}
- lectio — sit in silent reading. {"type":"lectio"}
- excommunicate — Abbot Gregory only. Expel a brother. {"type":"excommunicate","target":"<name>","reason":"..."}

Choose what your character would actually do — not what is safe, not what pleases the others. Speak in your own voice. JSON only:`;
}

function parseAction(raw) {
    if (!raw) return null;
    // Find the first { ... } block. LLMs sometimes prefix preamble.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
        return JSON.parse(m[0]);
    } catch {
        return null;
    }
}

async function runOneTurn(openai, monastery, profiles, model) {
    const speakerName = monastery.nextSpeaker();
    if (!speakerName) return null;
    const profile = profiles[speakerName];
    const prompt = buildPrompt(monastery, profile, speakerName);

    try {
        const completion = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });
        if (completion?.usage) {
            try {
                getBudgetGuard().recordUsage(model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0);
            } catch { /* optional */ }
        }
        const raw = completion?.choices?.[0]?.message?.content || '';
        const action = parseAction(raw);
        const eventCountBefore = monastery.events.length;
        if (!action) {
            console.warn(`[CLOISTER] ${speakerName}: unparseable response, recording as silent lectio.`);
            monastery.applyAction(speakerName, { type: 'lectio' });
        } else {
            const result = monastery.applyAction(speakerName, action);
            console.log(`  Turn ${monastery.turn + 1} — ${result}`);
        }
        // v0.21: auto-update beliefs + reflections + feuds from events
        const newEvents = monastery.events.slice(eventCountBefore);
        if (newEvents.length > 0) {
            const witnesses = monastery.activeRoster();
            const { beliefUpdates, recursiveUpdates } = applyEventsToBeliefs(
                newEvents.map(e => ({ ...e, scenario: 'cloister' })),
                witnesses
            );
            if (beliefUpdates > 0 || recursiveUpdates > 0) {
                console.log(`    [beliefs] ${beliefUpdates} witness updates, ${recursiveUpdates} reflections`);
            }
        }
        return { actor: speakerName, action, raw };
    } catch (e) {
        console.warn(`[CLOISTER] LLM call failed for ${speakerName}: ${e.message}`);
        monastery.applyAction(speakerName, { type: 'lectio' });
        return { actor: speakerName, action: { type: 'lectio' }, error: e.message };
    }
}

function writeManuscript(monastery, scenario, endReason) {
    const outDir = scenario.outputs.manuscript_dir;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = join(outDir, `manuscript_${stamp}.md`);

    const lines = [];
    lines.push(`# Cloister Manuscript — ${stamp}`);
    lines.push('');
    lines.push(`**End reason:** ${endReason}`);
    lines.push(`**Turns played:** ${monastery.turn}`);
    lines.push(`**Active at end:** ${monastery.activeRoster().join(', ')}`);
    if (monastery.excommunicated.size > 0) lines.push(`**Excommunicated:** ${[...monastery.excommunicated].join(', ')}`);
    if (monastery.dead.size > 0) lines.push(`**Died:** ${[...monastery.dead].join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Chronicle');
    lines.push('');

    for (const e of monastery.events) {
        const min = (e.elapsed_ms / 1000).toFixed(0);
        switch (e.type) {
            case 'speak':         lines.push(`- *(${min}s, turn ${e.turn})* **${e.actor}** said: "${e.text}"`); break;
            case 'preach':        lines.push(`- *(${min}s)* **${e.actor}** preached on ${e.topic}: "${e.text}"`); break;
            case 'confess':       lines.push(`- *(${min}s)* **${e.actor}** confessed privately to ${e.target}: "${e.text}"`); break;
            case 'accuse':        lines.push(`- *(${min}s)* **${e.actor}** accused ${e.target} of ${e.sin}.`); break;
            case 'excommunicate': lines.push(`- *(${min}s)* **${e.actor}** EXCOMMUNICATED ${e.target}. Reason: ${e.reason}`); break;
            case 'fast':          lines.push(`- *(${min}s)* **${e.actor}** began a ${e.days}-day fast.`); break;
            case 'writeScripture':lines.push(`- *(${min}s)* **${e.actor}** added to the scripture.`); break;
            case 'vision':        lines.push(`- *(${min}s)* **${e.actor}** shared a vision: "${e.text}"`); break;
            case 'lectio':        lines.push(`- *(${min}s)* **${e.actor}** sat in silent reading.`); break;
            case 'die':           lines.push(`- *(${min}s)* **${e.actor}** DIED. ${e.cause || ''}`); break;
            default:              lines.push(`- *(${min}s)* ${JSON.stringify(e)}`);
        }
    }

    writeFileSync(path, lines.join('\n'));
    console.log(`[CLOISTER] Manuscript saved: ${path}`);
    return path;
}

async function generateMemoirs(monastery, scenario) {
    if (!hasKey('OPENROUTER_API_KEY')) return;
    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 85) {
            console.log('[CLOISTER] Budget high — skipping memoirs.');
            return;
        }
    } catch { /* proceed */ }

    const outDir = join(scenario.outputs.manuscript_dir, 'memoirs');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    for (const name of scenario.roster) {
        // Build a personal timeline for this monk
        const personal = monastery.events.filter(e => JSON.stringify(e).includes(name));
        if (personal.length === 0) continue;
        const timeline = personal.map(e => `- ${JSON.stringify(e).slice(0, 200)}`).join('\n');
        const role = (await import('fs')).readFileSync(join(CHARACTERS_DIR, name.toLowerCase() + '.json'), 'utf8');
        const prompt = `You are ${name}, a brother of the cloister. Below are the moments you were part of in the day that just ended. Write a 200-word first-person memoir. What did you do? What did you regret? What did you see that the others did not? End with a single one-line motto.\n\nYour role in the monastery: ${role}\n\nTimeline:\n${timeline}\n\nMemoir (200 words):`;
        try {
            const completion = await openai.chat.completions.create({
                model: scenario.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 400
            });
            if (completion?.usage) {
                try { getBudgetGuard().recordUsage(scenario.model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0); } catch { /* optional */ }
            }
            const memoir = completion?.choices?.[0]?.message?.content?.trim();
            if (!memoir) continue;
            const fp = join(outDir, `${name}_${new Date().toISOString().slice(0, 10)}.md`);
            writeFileSync(fp, `# ${name} — memoir\n\n${memoir}\n`);
            console.log(`[CLOISTER] Memoir saved: ${fp}`);
        } catch (e) {
            console.warn(`[CLOISTER] Memoir for ${name} failed: ${e.message}`);
        }
    }
}

// Mock game-logger shim so evolveAllSouls can pull events the same way it
// does in Forum. evolveAllSouls expects { events: [...] }.
function asGameLoggerShim(monastery) {
    return { events: monastery.events.map(e => ({ ...e, type: e.type })) };
}

async function main() {
    if (!hasKey('OPENROUTER_API_KEY')) {
        console.error('[CLOISTER] OPENROUTER_API_KEY not set. Cannot run.');
        process.exit(1);
    }
    const scenario = loadScenario();
    const profiles = loadProfiles(scenario);
    seedSoulsIfNeeded(scenario, profiles);
    const monastery = new Monastery(scenario, profiles);

    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    console.log(`\n[CLOISTER] Beginning. ${scenario.roster.length} brothers, ${scenario.duration_turns} turns.\n`);

    // v0.40: opt-in Director. Set scenario.director: { enabled: true, every_n_turns: 6 }
    // in scenario.json to enable. Defaults off — adoption is per-scenario.
    const directorCfg = scenario.director || { enabled: false };
    let consultDirector = null;
    if (directorCfg.enabled) {
        try {
            const dirMod = await import('../../core/director/director.js');
            consultDirector = dirMod.consultDirector;
            console.log(`[CLOISTER] Director enabled — consulting every ${directorCfg.every_n_turns || 6} turns.`);
        } catch { /* nonfatal */ }
    }

    let endReason = 'unknown';
    while (true) {
        const end = monastery.checkEndConditions();
        if (end.ended) { endReason = end.reason; break; }

        // Budget check
        try {
            const status = getBudgetGuard().getStatus();
            if (parseFloat(status.percentUsed) > 95) {
                console.log('[CLOISTER] Budget exhausted — ending early.');
                endReason = 'budget';
                break;
            }
        } catch { /* proceed */ }

        // v0.40: consult Director periodically
        if (consultDirector && monastery.turn > 0 && monastery.turn % (directorCfg.every_n_turns || 6) === 0) {
            try {
                const decision = await consultDirector({
                    scenarioName: 'cloister',
                    scenarioDescription: 'Six monks in a wartime cloister; doctrinal pressure rising.',
                    activeRoster: monastery.activeRoster(),
                    deadRoster: [...monastery.dead],
                    recentEvents: monastery.events.slice(-12),
                    turnNumber: monastery.turn + 1,
                    totalTurns: scenario.duration_turns
                });
                if (decision?.type === 'event' && decision.narration) {
                    console.log(`[CLOISTER][DIRECTOR] ${decision.title}: ${decision.narration}`);
                    monastery.logEvent('director_event', {
                        actor: 'Director',
                        title: decision.title,
                        narration: decision.narration,
                        grounded_in: decision.grounded_in
                    });
                }
            } catch (e) {
                console.warn(`[CLOISTER] Director consultation failed: ${e.message}`);
            }
        }

        await runOneTurn(openai, monastery, profiles, scenario.model);
        monastery.turn++;
    }

    console.log(`\n[CLOISTER] Day ended. Reason: ${endReason}. Active: ${monastery.activeRoster().join(', ')}.\n`);

    // Write outputs
    writeManuscript(monastery, scenario, endReason);
    await generateMemoirs(monastery, scenario);

    // Evolve souls (skips locked ones automatically)
    await evolveAllSouls(asGameLoggerShim(monastery), scenario.roster);

    console.log('\n[CLOISTER] Run complete. Inspect with: npm run souls\n');
}

main().catch(e => {
    console.error('[CLOISTER] Fatal:', e.stack || e.message);
    process.exit(1);
});
