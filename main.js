import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { startGameClock } from './src/governance/game_setup.js';
import { getGovernanceManager } from './src/governance/governance_manager.js';
import { getGameLogger } from './src/governance/game_logger.js';
import { getNarrativeLogger } from './src/governance/narrative_logger.js';
import { refreshBudgetCapsFromSettings } from './src/governance/budget_guard.js';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .option('matchup', {
            type: 'string',
            describe: 'R3: Override per-faction model. Format: --matchup constitutional=anthropic/claude-3.5-sonnet,anarchy=openai/gpt-4o'
        })
        .option('preset', {
            type: 'string',
            describe: 'S2: Apply a settings preset. Options: "experiment" (cheap, fast, data-focused), "demo" (default polished play)'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

// R3: parse --matchup flag into a {faction: model} map
function parseMatchup(str) {
    if (!str) return null;
    const map = {};
    for (const pair of str.split(',')) {
        const [faction, model] = pair.split('=').map(s => s.trim());
        if (faction && model) map[faction] = model;
    }
    return Object.keys(map).length > 0 ? map : null;
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = process.env.MAX_MESSAGES;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = process.env.NUM_EXAMPLES;
}
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL;
}

// S2: --preset experiment for cheap, fast, data-focused runs
if (args.preset === 'experiment') {
    console.log('[PRESET] Applying experiment mode: 6 min games, no LLM summary/reflection, $0.50 cap, win conditions enabled, 30% faster cooldowns.');
    settings.game_clock = settings.game_clock || {};
    settings.game_clock.duration_minutes = 6;
    settings.game_clock.warning_minutes = [3, 1];
    // Disable optional LLM calls to keep cost down
    settings.disable_post_game_summary = true;
    settings.disable_reflections = true;
    // Lower budget cap to enforce frugality. BudgetGuard reads settings.budget.*
    settings.budget = settings.budget || {};
    settings.budget.session_cap_usd = 0.50;
    settings.budget.warning_threshold = 0.70;
    // Force interesting end conditions
    settings.win_conditions = settings.win_conditions || {};
    settings.win_conditions.last_faction_standing = { enabled: true };
    settings.win_conditions.first_to_resources = { enabled: true, threshold: 200 };
    // 30% faster cooldowns will be applied to each profile at spawn time
    settings._cooldown_multiplier = 0.7;
    // --preset experiment is for "given that democracy happens, does it produce
    // better outcomes?" — that means scripted scaffolding ON.
    settings.emergent_mode = false;
}

// F7: apply any settings.budget changes (preset or env-overridden) to the
// guard now, BEFORE the first LLM call could possibly fire.
refreshBudgetCapsFromSettings();

// v8: emergent mode swaps init_message and disables scaffolding
if (settings.emergent_mode && settings.init_message_emergent) {
    console.log('[v8] EMERGENT MODE — using soft init message, no nudges, no auto-election');
    settings.init_message = settings.init_message_emergent;
}

Mindcraft.init(true, settings.mindserver_port, settings.auto_open_ui);

// C1: Eagerly initialize loggers so they exist on disk even if no
// governance commands fire. Without these calls the loggers were lazy-init
// and the first session left logs/games and logs/narratives empty.
getGovernanceManager(); // Starts the governance tick
getGameLogger();        // Creates logs/games/<sessionId>.json
getNarrativeLogger();   // Writes prologue + creates logs/narratives/<sessionId>.md

// F6: Game clock will start AFTER spawnAgents completes — declared here but
// actually started below. Otherwise agent #6 (spawned at T+40s with 8s delay
// × 5 gaps) loses 40 seconds of a 6-min game = 11% of the playable time.
let gameClock = null;

// B3: Spawn agents one at a time with a delay (avoids Paper connection throttle).
// On failure, retry once after 10s, then log and continue past the failed agent.
const SPAWN_DELAY_MS = settings.spawn_delay_ms || 8000;
const matchup = parseMatchup(args.matchup);
if (matchup) console.log('[R3 MATCHUP]', matchup);

const CONSTITUTIONAL_NAMES = ['Madison', 'Hamilton', 'Paine', 'Marshall', 'Franklin'];
const ANARCHY_NAMES = ['Chaos', 'Wolf', 'Fox', 'Bear', 'Raven'];
function factionForProfile(name) {
    if (CONSTITUTIONAL_NAMES.includes(name)) return 'constitutional';
    if (ANARCHY_NAMES.includes(name)) return 'anarchy';
    return null;
}

async function spawnAgents() {
    const failed = [];
    const succeeded = [];

    for (let i = 0; i < settings.profiles.length; i++) {
        const profile = settings.profiles[i];
        const profile_json = JSON.parse(readFileSync(profile, 'utf8'));

        // R3: override the model based on faction matchup
        if (matchup) {
            const faction = factionForProfile(profile_json.name);
            if (faction && matchup[faction]) {
                profile_json.model = profile_json.model || {};
                profile_json.model.api = 'openrouter';
                profile_json.model.model = matchup[faction];
                console.log(`[R3] ${profile_json.name} (${faction}) → ${matchup[faction]}`);
            }
        }

        // S2: apply preset cooldown multiplier
        if (settings._cooldown_multiplier && profile_json.cooldown) {
            profile_json.cooldown = Math.round(profile_json.cooldown * settings._cooldown_multiplier);
            if (profile_json.idle_cooldown) profile_json.idle_cooldown = Math.round(profile_json.idle_cooldown * settings._cooldown_multiplier);
            if (profile_json.combat_cooldown) profile_json.combat_cooldown = Math.round(profile_json.combat_cooldown * settings._cooldown_multiplier);
        }

        const perAgentSettings = { ...settings, profile: profile_json };
        const name = profile_json.name;
        console.log(`[SPAWN] Starting agent ${i + 1}/${settings.profiles.length}: ${name}`);

        let result = null;
        try {
            result = await Mindcraft.createAgent(perAgentSettings);
            if (result?.success) {
                succeeded.push(name);
            } else {
                throw new Error(result?.error || 'unknown');
            }
        } catch (e) {
            console.warn(`[SPAWN] First attempt for ${name} failed: ${e.message}. Retrying in 10s...`);
            await new Promise(r => setTimeout(r, 10000));
            try {
                result = await Mindcraft.createAgent(perAgentSettings);
                if (result?.success) {
                    succeeded.push(name);
                    console.log(`[SPAWN] Retry succeeded for ${name}`);
                } else {
                    throw new Error(result?.error || 'unknown on retry');
                }
            } catch (e2) {
                console.error(`[SPAWN] ${name} FAILED after retry: ${e2.message}. Continuing without ${name}.`);
                failed.push(name);
            }
        }

        if (i < settings.profiles.length - 1) {
            await new Promise(r => setTimeout(r, SPAWN_DELAY_MS));
        }
    }

    console.log(`[SPAWN] Done. Spawned ${succeeded.length}/${settings.profiles.length}: [${succeeded.join(', ')}]`);
    if (failed.length > 0) {
        console.warn(`[SPAWN] Failed: [${failed.join(', ')}]`);
    }
}

spawnAgents()
    .then(() => {
        // F6: start game clock AFTER all agents have spawned (or attempted to).
        gameClock = startGameClock();
        if (gameClock) {
            console.log('[CLOCK] All agents spawned — game clock now starts.');
            gameClock.onTimeWarning((minutes, msg) => {
                console.log(`[GAME] ${msg}`);
            });
            gameClock.onGameEnd((scores) => {
                console.log('[GAME] GAME OVER!');
                console.log('[GAME] Final scores:', JSON.stringify(scores, null, 2));
                setTimeout(() => Mindcraft.shutdown(), 20000);
            });

            // G3: Auto-call election if no president by T+90s.
            // Skipped in emergent mode — let it fail organically if agents don't act.
            if (!settings.emergent_mode) {
                setTimeout(() => {
                    try {
                        const gov = getGovernanceManager();
                        if (!gov.constitution.offices.president.holder) {
                            const active = gov.elections.find(e => e.office === 'president' && e.status !== 'completed');
                            if (!active) {
                                console.log('[G3] T+90s: No president, no active election — auto-calling.');
                                const r = gov.callElection('system', 'president');
                                console.log('[G3]', r.message);
                            }
                        }
                    } catch (e) {
                        console.warn('[G3] auto-election check failed:', e.message);
                    }
                }, 90000);
            } else {
                console.log('[v8 EMERGENT] Auto-election disabled — agents must organize on their own.');
            }
        }
    })
    .catch(err => {
        console.error('[SPAWN] Fatal error:', err);
        // Don't exit — let the rest of the system keep running so we can inspect
    });