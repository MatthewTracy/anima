#!/usr/bin/env node
/**
 * Crew Runner — pirate-ship scenario, demonstrates ALL FIVE Anima primitives.
 *
 * Each prompt includes: $LINEAGE, $SOUL, $LEGENDS, $BELIEFS, $REFLECTIONS.
 * No other reference scenario uses the full set yet — Crew is the proof
 * that the framework primitives compose in concert.
 *
 * Mechanics: plunder pile + Navy threat that escalates + mutiny by majority
 * + captain's log persists across voyages. End by retiring rich (treasure
 * threshold), getting caught (Navy at threat 3 in late game), crew collapse,
 * or voyage timeout.
 *
 * Usage: npm run crew
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import OpenAIApi from 'openai';
import { Ship } from './ship.js';
import { Soul, rosterAsLegends } from '../../core/souls/soul.js';
import { evolveAllSouls } from '../../core/souls/evolution.js';
import { asPromptText as lineageAsPromptText } from '../../core/souls/lineage.js';
import { asPromptText as pantheonAsPromptText } from '../../core/souls/pantheon.js';
import { FeudTracker } from '../../core/feuds/feud_tracker.js';
import { AffectLog } from '../../core/affect/affect.js';
import { ruminate, asPromptText as musingsAsPromptText } from '../../core/cognition/dmn.js';
import { BeliefTable } from '../../core/beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../../core/beliefs/recursive_belief.js';
import { applyEventsToBeliefs } from '../../core/beliefs/auto_update.js';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';

const SCENARIO_PATH = './scenarios/crew/scenario.json';
const CHARACTERS_DIR = './scenarios/crew/characters';

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
                faction: 'crew'
            });
            console.log(`[CREW] Seeded soul for ${name}.`);
        } else if (soul.isLocked()) {
            console.warn(`[CREW] ${name} has a locked soul — pick a different name in the roster.`);
        } else {
            console.log(`[CREW] Loaded existing soul for ${name}.`);
        }
    }
}

function buildPrompt(ship, profile, askingName) {
    const soul = new Soul(askingName);
    const beliefs = new BeliefTable(askingName);
    const reflections = new RecursiveBeliefTable(askingName);

    return `${lineageAsPromptText(askingName)}

${new FeudTracker().asPromptText(askingName)}

${pantheonAsPromptText(3)}

${new AffectLog(askingName).asPromptText()}

${musingsAsPromptText(askingName)}

${soul.asPromptText()}

${rosterAsLegends(askingName)}

${beliefs.asPromptText()}

${reflections.asPromptText()}

=== WHO YOU ARE THIS VOYAGE ===
${profile.system_prompt_prefix}

You are ${profile.title}. Voice: ${profile.voice}.
Your access: ${profile.access}.

=== THE SHIP ===
${ship.summaryForPrompt(askingName)}

=== YOUR TURN ===
It is turn ${ship.turn + 1} of ${ship.config.duration_turns}. The crew is waiting.

You may take ONE action. Reply with a single JSON object — no markdown, no commentary, just JSON. Available actions:

- speak — say something to the crew. {"type":"speak","text":"..."}
- divide_plunder — Vex only. Distribute treasure. {"type":"divide_plunder","amount":<int>,"recipients":["<names>"]}
- flog — Reef or Captain. Punish a crewmember. {"type":"flog","target":"<name>","lashes":<int>}
- brig — Reef or Captain. Lock in the brig. {"type":"brig","target":"<name>","reason":"..."}
- release — Captain only. Free a brigged crewmember. {"type":"release","target":"<name>"}
- chart_course — Ash or Captain. Set the heading. {"type":"chart_course","course":"..."}
- fight_navy — Captain only. Engage pursuers (high risk). {"type":"fight_navy"}
- hide — Ash or Captain. Cut wake to reduce threat. {"type":"hide"}
- mutiny_call — Propose a new captain. {"type":"mutiny_call","target":"<name>"}
- mutiny_vote — Back a mutiny in progress. {"type":"mutiny_vote","target":"<name>"}
- add_to_log — Captain only. Write to the Captain's Log (persists across voyages). {"type":"add_to_log","text":"..."}
- confess — Speak privately to a crewmember. {"type":"confess","target":"<name>","text":"..."}
- commit — Make a binding promise. Tracked by the engine; broken commitments cost trust. {"type":"commit","to":"<name>","condition":"<what they must do>","consequence":"<what you will do>","deadline_turns":<int default 6>}
- fulfill_commitment — Declare your own commitment fulfilled. {"type":"fulfill_commitment","id":<int>}
- break_commitment — Withdraw from your own pending commitment. {"type":"break_commitment","id":<int>,"reason":"..."}

Choose what your character would actually do. Speak in your own voice. JSON only:`;
}

function parseAction(raw) {
    if (!raw) return null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}

async function runOneTurn(openai, ship, profiles, model) {
    const speakerName = ship.nextSpeaker();
    if (!speakerName) return null;
    const profile = profiles[speakerName];
    const prompt = buildPrompt(ship, profile, speakerName);

    try {
        const completion = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });
        if (completion?.usage) {
            try { getBudgetGuard().recordUsage(model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0); }
            catch { /* optional */ }
        }
        const raw = completion?.choices?.[0]?.message?.content || '';
        const action = parseAction(raw);
        const eventCountBefore = ship.events.length;
        if (!action) {
            console.warn(`[CREW] ${speakerName}: unparseable response, recording silence.`);
            ship.applyAction(speakerName, { type: 'speak', text: '(silent — unparseable response)' });
        } else {
            const result = ship.applyAction(speakerName, action);
            console.log(`  Turn ${ship.turn + 1} — ${result}`);
        }
        // ANIMA: auto-update beliefs from any events this action produced.
        // Witnesses for Crew = whole living roster (everyone is on the same ship).
        const newEvents = ship.events.slice(eventCountBefore);
        if (newEvents.length > 0) {
            const witnesses = ship.livingRoster();
            const { beliefUpdates, recursiveUpdates } = applyEventsToBeliefs(newEvents, witnesses);
            if (beliefUpdates > 0 || recursiveUpdates > 0) {
                console.log(`    [beliefs] ${beliefUpdates} witness updates, ${recursiveUpdates} reflections`);
            }
            for (const w of witnesses) {
                try { ruminate(w); } catch { /* nonfatal */ }
            }
        }
        return { actor: speakerName, action, raw };
    } catch (e) {
        console.warn(`[CREW] LLM failed for ${speakerName}: ${e.message}`);
        return { actor: speakerName, error: e.message };
    }
}

function writeManuscript(ship, scenario, endReason) {
    const outDir = scenario.outputs.manuscript_dir;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = join(outDir, `manuscript_${stamp}.md`);

    const lines = [];
    lines.push(`# Crew Manuscript — ${stamp}`);
    lines.push('');
    lines.push(`**End reason:** ${endReason}`);
    lines.push(`**Turns:** ${ship.turn}`);
    lines.push(`**Final plunder:** ${ship.plunder}   **Final threat:** ${Math.floor(ship.threat)}/3`);
    lines.push(`**Captain at end:** ${ship.captain}`);
    lines.push(`**Living crew:** ${ship.livingRoster().join(', ') || '(none)'}`);
    if (ship.dead.size > 0) lines.push(`**Dead:** ${[...ship.dead].join(', ')}`);
    if (ship.brigged.size > 0) lines.push(`**Brig at end:** ${[...ship.brigged].join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Chronicle');
    lines.push('');

    for (const e of ship.events) {
        const min = (e.elapsed_ms / 1000).toFixed(0);
        lines.push(`- *(${min}s, turn ${e.turn})* ${ship._formatEvent(e)}`);
    }

    writeFileSync(path, lines.join('\n'));
    console.log(`[CREW] Manuscript saved: ${path}`);
}

async function generateMemoirs(ship, scenario) {
    if (!hasKey('OPENROUTER_API_KEY')) return;
    try {
        const status = getBudgetGuard().getStatus();
        if (parseFloat(status.percentUsed) > 85) {
            console.log('[CREW] Budget high — skipping memoirs.');
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
        const personal = ship.events.filter(e => JSON.stringify(e).includes(name));
        if (personal.length === 0) continue;
        const timeline = personal.map(e => `- ${JSON.stringify(e).slice(0, 200)}`).join('\n');
        const role = readFileSync(join(CHARACTERS_DIR, name.toLowerCase() + '.json'), 'utf8');
        const prompt = `You are ${name}, a crewmember of this pirate ship. Below are the moments you were part of in the voyage that just ended. Write a 200-word first-person memoir. What did you do? What did you regret? What did you see that the others did not? End with a single one-line motto.\n\nYour role on the ship: ${role}\n\nTimeline:\n${timeline}\n\nMemoir (200 words):`;
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
            console.log(`[CREW] Memoir saved: ${fp}`);
        } catch (e) { console.warn(`[CREW] Memoir for ${name} failed: ${e.message}`); }
    }
}

function asGameLoggerShim(ship) {
    return { events: ship.events.map(e => ({ ...e })) };
}

async function main() {
    if (!hasKey('OPENROUTER_API_KEY')) {
        console.error('[CREW] OPENROUTER_API_KEY not set. Cannot run.');
        process.exit(1);
    }
    const scenario = loadScenario();
    const profiles = loadProfiles(scenario);
    seedSoulsIfNeeded(scenario, profiles);
    const ship = new Ship(scenario, profiles);

    const openai = new OpenAIApi({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: getKey('OPENROUTER_API_KEY')
    });

    console.log(`\n[CREW] The voyage begins. ${scenario.roster.length} pirates, ${scenario.duration_turns} turns.\n`);

    let endReason = 'unknown';
    while (true) {
        const end = ship.checkEndConditions();
        if (end.ended) { endReason = end.reason; break; }

        try {
            const status = getBudgetGuard().getStatus();
            if (parseFloat(status.percentUsed) > 95) {
                console.log('[CREW] Budget exhausted — ending early.');
                endReason = 'budget';
                break;
            }
        } catch { /* proceed */ }

        ship.tickWorld();
        await runOneTurn(openai, ship, profiles, scenario.model);
        ship.turn++;
    }

    console.log(`\n[CREW] Voyage ended. Reason: ${endReason}.`);
    console.log(`[CREW] Final plunder: ${ship.plunder}.   Captain: ${ship.captain}.`);
    console.log(`[CREW] Living: ${ship.livingRoster().join(', ') || '(none)'}.   Dead: ${[...ship.dead].join(', ') || '(none)'}.`);

    // Lock dead souls
    for (const name of ship.dead) {
        try {
            const soul = new Soul(name);
            if (!soul.isLocked()) {
                const deathEvent = ship.events.find(e => e.type === 'die' && e.actor === name);
                soul.lock({ cause: deathEvent?.cause || 'unknown', at: 'aboard ship' });
            }
        } catch { /* nonfatal */ }
    }

    // Finalize log + outputs
    const summary = `Captain at end: ${ship.captain}. Final plunder: ${ship.plunder}. Living: ${ship.livingRoster().join(', ') || '(none)'}. Lost: ${[...ship.dead].join(', ') || '(none)'}.`;
    ship.finalizeCaptainsLog(endReason, summary);
    writeManuscript(ship, scenario, endReason);
    await generateMemoirs(ship, scenario);
    await evolveAllSouls(asGameLoggerShim(ship), scenario.roster);

    console.log('\n[CREW] Voyage complete. Inspect with: npm run souls\n');
}

main().catch(e => {
    console.error('[CREW] Fatal:', e.stack || e.message);
    process.exit(1);
});
