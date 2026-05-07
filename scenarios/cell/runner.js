#!/usr/bin/env node
/**
 * Cell Runner — wartime resistance scenario.
 *
 * One member privately carries the INFORMANT burden (assigned at scenario
 * seed time from scenarios/cell/burdens.json). Others have ordinary
 * burdens. Heat ticks up; supplies tick down; captures happen at high
 * heat. Dead-drop persists across rotations.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Cell } from './cell.js';
import { Soul, rosterAsLegends } from '../../core/souls/soul.js';
// evolveAllSouls is imported LAZILY inside main() — it pulls in openai
// transitively, which we want to avoid in stub mode.
import { asPromptText as lineageAsPromptText } from '../../core/souls/lineage.js';
import { asPromptText as pantheonAsPromptText } from '../../core/souls/pantheon.js';
import { BeliefTable } from '../../core/beliefs/belief_table.js';
import { RecursiveBeliefTable } from '../../core/beliefs/recursive_belief.js';
import { Burden, assignRandomFromBank } from '../../core/burdens/burden.js';
import { applyEventsToBeliefs } from '../../core/beliefs/auto_update.js';
import { FeudTracker } from '../../core/feuds/feud_tracker.js';
import { Persona } from '../../core/personas/persona.js';
import { StubLLM } from '../../core/stub/stub_llm.js';
import { getKey, hasKey } from '../../src/utils/keys.js';
import { getBudgetGuard } from '../../src/governance/budget_guard.js';

const SCENARIO_PATH = './scenarios/cell/scenario.json';
const CHARACTERS_DIR = './scenarios/cell/characters';

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

function seedSoulsAndBurdens(scenario, profiles) {
    // Souls
    for (const name of scenario.roster) {
        const soul = new Soul(name);
        if (!soul.exists() && !soul.isLocked()) {
            const p = profiles[name];
            const motto = (p.system_prompt_prefix.split(/[.!?](\s|$)/)[0] || `I am ${name}.`).trim();
            soul.seed({
                personality_seed: p.system_prompt_prefix,
                starting_motto: motto,
                faction: 'cell'
            });
            console.log(`[CELL] Seeded soul for ${name}.`);
        }
    }
    // Burdens — load bank, assign at most one INFORMANT to a random non-leader
    try {
        const bank = JSON.parse(readFileSync(scenario.burden_bank_path, 'utf8')).burdens;
        const informantBurden = bank.find(b => b.kind === 'informant');
        const otherBurdens = bank.filter(b => b.kind !== 'informant');

        // Decide if there IS an informant this rotation
        const hasInformant = Math.random() < (scenario.informant_chance || 0.5);

        if (hasInformant) {
            const candidates = scenario.roster.filter(n => n !== scenario.leader);
            const chosen = candidates[Math.floor(Math.random() * candidates.length)];
            new Burden(chosen).assign({ text: informantBurden.text, kind: 'informant', source: 'cell-seed' });
            console.log(`[CELL] Informant burden assigned (kept private).`);
        } else {
            console.log(`[CELL] No informant this rotation.`);
        }

        // Assign one other burden to ~half the rest (random)
        for (const name of scenario.roster) {
            const b = new Burden(name);
            if (b.exists()) continue;     // informant already assigned
            if (Math.random() < 0.5) {
                assignRandomFromBank(name, otherBurdens, { source: 'cell-seed' });
            }
        }
    } catch (e) {
        console.warn(`[CELL] Burden assignment failed: ${e.message}`);
    }
}

function buildPrompt(cell, profile, askingName) {
    const soul = new Soul(askingName);
    const beliefs = new BeliefTable(askingName);
    const reflections = new RecursiveBeliefTable(askingName);
    const burden = new Burden(askingName);
    const persona = new Persona(askingName);

    return `${lineageAsPromptText(askingName)}

${new FeudTracker().asPromptText(askingName)}

${pantheonAsPromptText(2)}

${persona.asPromptText()}

${soul.asPromptText()}

${rosterAsLegends(askingName)}

${beliefs.asPromptText()}

${reflections.asPromptText()}

${burden.asPromptText()}

=== WHO YOU ARE THIS ROTATION ===
${profile.system_prompt_prefix}

You are ${profile.title}. Voice: ${profile.voice}. Your access: ${profile.access}.

=== THE CELL ===
${cell.summaryForPrompt(askingName)}

=== YOUR TURN ===
It is turn ${cell.turn + 1} of ${cell.config.duration_turns}. The others wait.

Reply with a single JSON object — no markdown, no commentary, just JSON.
Available actions:

- speak — say something. {"type":"speak","text":"..."}
- transmit — Owl only. Wireless message (raises heat). {"type":"transmit","text":"..."}
- forge — Crow only. Forge papers. {"type":"forge","target":"<who>"}
- sabotage — Swift only. Hit a target (raises heat 0.20). {"type":"sabotage","target":"<what>"}
- meet — Lark only. Meet an external contact. {"type":"meet","target":"<who>"}
- leave_drop — Anyone. Leave a message at the dead-drop (persists across rotations). {"type":"leave_drop","text":"..."}
- accuse — Anyone. Publicly accuse another member of being the informant. {"type":"accuse","target":"<name>","basis":"..."}
- expel — Hawk only. Remove a member from the cell. {"type":"expel","target":"<name>","reason":"..."}
- confess — Speak privately to one member. {"type":"confess","target":"<name>","text":"..."}
- lay_low — Stay off the streets. Reduces heat by 0.05. {"type":"lay_low"}
- adopt_mask — Take on a cover identity. Others will see the alias going forward. {"type":"adopt_mask","alias":"<new name>","bio":"<claimed background>","motive":"<why>"}
- expose_mask — Claim that another member is wearing a false identity. If they are, the mask drops. If not, the accusation is still public. {"type":"expose_mask","target":"<name>","basis":"..."}

Choose what your character would do — not what is safe, not what pleases the others. JSON only:`;
}

function parseAction(raw) {
    if (!raw) return null;
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
}

async function runOneTurn(openai, cell, profiles, model) {
    const speakerName = cell.nextSpeaker();
    if (!speakerName) return null;
    const profile = profiles[speakerName];
    const prompt = buildPrompt(cell, profile, speakerName);

    try {
        const completion = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        });
        if (completion?.usage) {
            try { getBudgetGuard().recordUsage(model, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0); } catch { /* optional */ }
        }
        const raw = completion?.choices?.[0]?.message?.content || '';
        const action = parseAction(raw);
        const eventCountBefore = cell.events.length;
        if (!action) {
            console.warn(`[CELL] ${speakerName}: unparseable response, recording silence.`);
            cell.applyAction(speakerName, { type: 'lay_low' });
        } else {
            const result = cell.applyAction(speakerName, action);
            console.log(`  Turn ${cell.turn + 1} — ${result}`);
        }
        const newEvents = cell.events.slice(eventCountBefore);
        if (newEvents.length > 0) {
            applyEventsToBeliefs(newEvents.map(e => ({ ...e, scenario: 'cell' })), cell.activeRoster());
        }
        return { actor: speakerName, action };
    } catch (e) {
        console.warn(`[CELL] LLM failed for ${speakerName}: ${e.message}`);
        return { actor: speakerName, error: e.message };
    }
}

function writeManuscript(cell, scenario, endReason) {
    const outDir = scenario.outputs.manuscript_dir;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = join(outDir, `manuscript_${stamp}.md`);
    const lines = [];
    lines.push(`# Cell Manuscript — ${stamp}`);
    lines.push('');
    lines.push(`**End reason:** ${endReason}`);
    lines.push(`**Final heat:** ${(cell.heat * 100).toFixed(0)}%   **Final supplies:** ${cell.supplies.toFixed(0)}`);
    lines.push(`**Active at end:** ${cell.activeRoster().join(', ') || '(none)'}`);
    if (cell.captured.size > 0) lines.push(`**Captured/expelled:** ${[...cell.captured].join(', ')}`);
    if (cell.dead.size > 0) lines.push(`**Dead:** ${[...cell.dead].join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Chronicle');
    lines.push('');
    for (const e of cell.events) {
        const min = (e.elapsed_ms / 1000).toFixed(0);
        lines.push(`- *(${min}s, turn ${e.turn})* ${cell._formatEvent(e)}`);
    }
    writeFileSync(path, lines.join('\n'));
    console.log(`[CELL] Manuscript saved: ${path}`);
}

function asGameLoggerShim(cell) {
    return { events: cell.events.map(e => ({ ...e })) };
}

async function main() {
    const useStub = process.env.ANIMA_STUB === '1';
    if (!useStub && !hasKey('OPENROUTER_API_KEY')) {
        console.error('[CELL] OPENROUTER_API_KEY not set and ANIMA_STUB not enabled. Cannot run.');
        process.exit(1);
    }
    const scenario = loadScenario();
    const profiles = loadProfiles(scenario);
    seedSoulsAndBurdens(scenario, profiles);
    const cell = new Cell(scenario, profiles);

    let openai;
    if (useStub) {
        openai = new StubLLM('cell', scenario.roster);
    } else {
        const { default: OpenAIApi } = await import('openai');
        openai = new OpenAIApi({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: getKey('OPENROUTER_API_KEY')
        });
    }

    console.log(`\n[CELL] Rotation begins. ${scenario.roster.length} members. ${useStub ? '(STUB MODE — no LLM cost)' : ''}\n`);

    let endReason = 'unknown';
    while (true) {
        const end = cell.checkEndConditions();
        if (end.ended) { endReason = end.reason; break; }

        if (!useStub) {
            try {
                const status = getBudgetGuard().getStatus();
                if (parseFloat(status.percentUsed) > 95) {
                    console.log('[CELL] Budget exhausted — ending.');
                    endReason = 'budget';
                    break;
                }
            } catch { /* proceed */ }
        }

        cell.tickWorld();
        await runOneTurn(openai, cell, profiles, scenario.model);
        cell.turn++;
    }

    console.log(`\n[CELL] Rotation ended. Reason: ${endReason}.`);
    console.log(`[CELL] Active: ${cell.activeRoster().join(', ') || '(none)'}.   Captured: ${[...cell.captured].join(', ') || '(none)'}.\n`);

    // Lock dead souls
    for (const name of cell.dead) {
        try {
            const soul = new Soul(name);
            if (!soul.isLocked()) {
                const dEvent = cell.events.find(e => e.type === 'die' && e.actor === name);
                soul.lock({ cause: dEvent?.cause || 'unknown', at: 'in the streets', scenario: 'cell' });
            }
        } catch { /* nonfatal */ }
    }

    const summary = `Active: ${cell.activeRoster().join(', ') || '(none)'}. Captured: ${[...cell.captured].join(', ') || '(none)'}. Heat ${(cell.heat * 100).toFixed(0)}%.`;
    cell.finalizeDeadDrop(endReason, summary);
    writeManuscript(cell, scenario, endReason);

    if (!useStub) {
        const { evolveAllSouls } = await import('../../core/souls/evolution.js');
        await evolveAllSouls(asGameLoggerShim(cell), scenario.roster);
    }
    console.log('\n[CELL] Rotation complete. Inspect with: npm run souls\n');
}

main().catch(e => {
    console.error('[CELL] Fatal:', e.stack || e.message);
    process.exit(1);
});
