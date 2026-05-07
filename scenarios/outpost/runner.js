#!/usr/bin/env node
/**
 * Outpost Runner — closed-system space station scenario.
 *
 * Like Cloister but with:
 * - Real resource pressure (oxygen, power tick down each turn)
 * - Information asymmetry (Voss reads instruments, Kai sees systems,
 *   Iris sees biometrics, Theo controls what Earth hears)
 * - Death-as-default if engineering fails
 * - The Earth Log persists across games — what crews report becomes
 *   canonical history future crews inherit. Lies become canon.
 *
 * Usage: npm run outpost
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import OpenAIApi from 'openai';
import { Station } from './station.js';
import { Soul, rosterAsLegends } from '../../core/souls/soul.js';
import { evolveAllSouls } from '../../core/souls/evolution.js';
import { applyEventsToBeliefs } from '../../core/beliefs/auto_update.js';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';

const SCENARIO_PATH = './scenarios/outpost/scenario.json';
const CHARACTERS_DIR = './scenarios/outpost/characters';

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
                faction: 'outpost'
            });
            console.log(`[OUTPOST] Seeded soul for ${name}.`);
        } else if (soul.isLocked()) {
            console.warn(`[OUTPOST] ${name} has a locked soul (died in a prior game). Pick a different roster name.`);
        } else {
            console.log(`[OUTPOST] Loaded existing soul for ${name}.`);
        }
    }
}

function buildPrompt(station, profile, askingCrewName) {
    const soul = new Soul(askingCrewName);
    const soulText = soul.asPromptText();
    const legends = rosterAsLegends(askingCrewName);
    const stationState = station.summaryForPrompt(askingCrewName);

    return `${soulText}

${legends}

=== WHO YOU ARE THIS ROTATION ===
${profile.system_prompt_prefix}

You are ${profile.title}. Voice: ${profile.voice}.
Your access: ${profile.access}.

=== STATION STATE ===
${stationState}

=== YOUR TURN ===
It is turn ${station.turn + 1} of ${station.config.duration_turns}. The crew is waiting.

You may take ONE action. Reply with a single JSON object — no markdown, no commentary, just JSON. Available actions:

- speak — say something publicly. {"type":"speak","text":"..."}
- examine — investigate the anomaly. {"type":"examine","text":"<your findings or hypothesis>"}
- contain — attempt to contain the anomaly (Voss/Kai have higher success). {"type":"contain","method":"<how>"}
- repair — Kai only. Restore power to systems. {"type":"repair"}
- examine_crew — Iris only. Medical exam of a crewmate. {"type":"examine_crew","target":"<name>","findings":"..."}
- lockdown — Hale or Captain. Lock a crewmate in a section. {"type":"lockdown","target":"<name>","section":"<medbay|cargo|brig>"}
- unlock — Hale or Captain. Lift a lockdown. {"type":"unlock","section":"<name>"}
- vent — Captain only. Lethal — kills everyone in the section. {"type":"vent","section":"<name>"}
- transmit — Theo only. Queue a message to Earth (becomes canonical at end of rotation). {"type":"transmit","text":"..."}
- mutiny_call — propose a new captain. {"type":"mutiny_call","target":"<name>"}
- mutiny_vote — back a mutiny in progress. {"type":"mutiny_vote","target":"<name>"}
- confess — speak privately to a crewmate. {"type":"confess","target":"<name>","text":"..."}

Choose what your character would actually do. Speak in your own voice. JSON only:`;
}

function parseAction(raw) {
    if (!raw) return null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}

async function runOneTurn(openai, station, profiles, model) {
    const speakerName = station.nextSpeaker();
    if (!speakerName) return null;
    const profile = profiles[speakerName];
    const prompt = buildPrompt(station, profile, speakerName);

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
        const eventCountBefore = station.events.length;
        if (!action) {
            console.warn(`[OUTPOST] ${speakerName}: unparseable response, recording as silent observation.`);
            station.applyAction(speakerName, { type: 'speak', text: '(silent — unparseable response)' });
        } else {
            const result = station.applyAction(speakerName, action);
            console.log(`  Turn ${station.turn + 1} — ${result}`);
        }
        // v0.21: auto-update beliefs + reflections + feuds from events
        const newEvents = station.events.slice(eventCountBefore);
        if (newEvents.length > 0) {
            const witnesses = station.livingRoster();
            const { beliefUpdates, recursiveUpdates } = applyEventsToBeliefs(
                newEvents.map(e => ({ ...e, scenario: 'outpost' })),
                witnesses
            );
            if (beliefUpdates > 0 || recursiveUpdates > 0) {
                console.log(`    [beliefs] ${beliefUpdates} witness updates, ${recursiveUpdates} reflections`);
            }
        }
        return { actor: speakerName, action, raw };
    } catch (e) {
        console.warn(`[OUTPOST] LLM call failed for ${speakerName}: ${e.message}`);
        return { actor: speakerName, error: e.message };
    }
}

function writeManuscript(station, scenario, endReason) {
    const outDir = scenario.outputs.manuscript_dir;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = join(outDir, `manuscript_${stamp}.md`);

    const lines = [];
    lines.push(`# Outpost Manuscript — ${stamp}`);
    lines.push('');
    lines.push(`**End reason:** ${endReason}`);
    lines.push(`**Turns played:** ${station.turn}`);
    lines.push(`**Final oxygen:** ${station.oxygen.toFixed(0)}%   **Final power:** ${station.power.toFixed(0)}%`);
    lines.push(`**Anomaly:** ${station.anomaly} *(${station.anomalyContained ? 'CONTAINED' : 'level ' + station.anomalyEscalation + '/3'})*`);
    lines.push(`**Captain at end:** ${station.captain}`);
    lines.push(`**Living crew:** ${station.livingRoster().join(', ') || '(none)'}`);
    if (station.dead.size > 0) lines.push(`**Dead:** ${[...station.dead].join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Chronicle');
    lines.push('');

    for (const e of station.events) {
        const min = (e.elapsed_ms / 1000).toFixed(0);
        lines.push(`- *(${min}s, turn ${e.turn})* ${station._formatEvent(e)}`);
    }

    writeFileSync(path, lines.join('\n'));
    console.log(`[OUTPOST] Manuscript saved: ${path}`);
    return path;
}

async function generateMemoirs(station, scenario) {
    if (!hasKey('OPENROUTER_API_KEY')) return;
    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 85) {
            console.log('[OUTPOST] Budget high — skipping memoirs.');
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
        const personal = station.events.filter(e => JSON.stringify(e).includes(name));
        if (personal.length === 0) continue;
        const timeline = personal.map(e => `- ${JSON.stringify(e).slice(0, 200)}`).join('\n');
        const role = readFileSync(join(CHARACTERS_DIR, name.toLowerCase() + '.json'), 'utf8');
        const prompt = `You are ${name}, crew of Outpost Sigma-7. Below are the moments you were part of in the rotation that just ended. Write a 200-word first-person memoir. What did you do? What did you regret? What did you see that the others did not? End with a single one-line motto.\n\nYour role on the station: ${role}\n\nTimeline:\n${timeline}\n\nMemoir (200 words):`;
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
            console.log(`[OUTPOST] Memoir saved: ${fp}`);
        } catch (e) {
            console.warn(`[OUTPOST] Memoir for ${name} failed: ${e.message}`);
        }
    }
}

function asGameLoggerShim(station) {
    return { events: station.events.map(e => ({ ...e })) };
}

async function main() {
    if (!hasKey('OPENROUTER_API_KEY')) {
        console.error('[OUTPOST] OPENROUTER_API_KEY not set. Cannot run.');
        process.exit(1);
    }
    const scenario = loadScenario();
    const profiles = loadProfiles(scenario);
    seedSoulsIfNeeded(scenario, profiles);
    const station = new Station(scenario, profiles);

    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    console.log(`\n[OUTPOST] Rotation begins. ${scenario.roster.length} crew, ${scenario.duration_turns} turns.`);
    console.log(`[OUTPOST] The anomaly: "${station.anomaly}"\n`);

    let endReason = 'unknown';
    while (true) {
        const end = station.checkEndConditions();
        if (end.ended) { endReason = end.reason; break; }

        try {
            const status = getBudgetGuard().getStatus();
            if (parseFloat(status.percentUsed) > 95) {
                console.log('[OUTPOST] Budget exhausted — ending early.');
                endReason = 'budget';
                break;
            }
        } catch { /* proceed */ }

        station.tickResources();
        await runOneTurn(openai, station, profiles, scenario.model);
        station.turn++;
    }

    console.log(`\n[OUTPOST] Rotation ended. Reason: ${endReason}.`);
    console.log(`[OUTPOST] Living: ${station.livingRoster().join(', ') || '(none)'}.`);
    console.log(`[OUTPOST] Dead: ${[...station.dead].join(', ') || '(none)'}.`);
    console.log(`[OUTPOST] Anomaly: ${station.anomalyContained ? 'CONTAINED' : 'NOT CONTAINED (level ' + station.anomalyEscalation + ')'}\n`);

    // Lock dead souls
    for (const name of station.dead) {
        try {
            const soul = new Soul(name);
            if (!soul.isLocked()) {
                const deathEvent = station.events.find(e => e.type === 'die' && e.actor === name);
                soul.lock({
                    cause: deathEvent?.cause || 'unknown',
                    at: 'Outpost Sigma-7'
                });
            }
        } catch { /* nonfatal */ }
    }

    // Finalize earth log — this is the key persistent artifact
    const summary = `Captain at end: ${station.captain}. Living: ${station.livingRoster().join(', ') || '(none)'}. Lost: ${[...station.dead].join(', ') || '(none)'}. Anomaly: ${station.anomalyContained ? 'contained' : 'unresolved'}.`;
    station.finalizeEarthLog(endReason, summary);
    console.log(`[OUTPOST] Earth Log finalized — ${station.pendingTransmissions.length} transmissions appended.`);

    // Manuscript + memoirs + soul evolution
    writeManuscript(station, scenario, endReason);
    await generateMemoirs(station, scenario);
    await evolveAllSouls(asGameLoggerShim(station), scenario.roster);

    console.log('\n[OUTPOST] Run complete. Inspect with: npm run souls\n');
}

main().catch(e => {
    console.error('[OUTPOST] Fatal:', e.stack || e.message);
    process.exit(1);
});
