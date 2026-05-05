import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { startGameClock } from './src/governance/game_setup.js';
import { getGovernanceManager } from './src/governance/governance_manager.js';
import { getGameLogger } from './src/governance/game_logger.js';
import { getNarrativeLogger } from './src/governance/narrative_logger.js';

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

Mindcraft.init(true, settings.mindserver_port, settings.auto_open_ui);

// C1: Eagerly initialize ALL loggers so they exist on disk even if no
// governance commands fire. Without these calls the loggers were lazy-init
// and the first session left logs/games and logs/narratives empty.
getGovernanceManager(); // Starts the governance tick
getGameLogger();        // Creates logs/games/<sessionId>.json
getNarrativeLogger();   // Writes prologue + creates logs/narratives/<sessionId>.md

const gameClock = startGameClock();
if (gameClock) {
    gameClock.onTimeWarning((minutes, msg) => {
        console.log(`[GAME] ${msg}`);
    });
    gameClock.onGameEnd((scores) => {
        console.log('[GAME] GAME OVER!');
        console.log('[GAME] Final scores:', JSON.stringify(scores, null, 2));
        // B6: 20s grace period — gives session_journal + post_game_summary
        // time to flush to disk before processes exit.
        setTimeout(() => {
            Mindcraft.shutdown();
        }, 20000);
    });
}

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

spawnAgents().catch(err => {
    console.error('[SPAWN] Fatal error:', err);
    // Don't exit — let the rest of the system keep running so we can inspect
});