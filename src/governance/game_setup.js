/**
 * GameSetup - Handles initial game world setup:
 * - Teleports factions to their spawn zones
 * - Sets world border (optional)
 * - Starts the game clock
 */

import settings from '../../settings.js';
import { getGameClock } from './game_clock.js';
import { CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS } from './governance_manager.js';

const spawnConfig = settings.spawn || {};
const clockConfig = settings.game_clock || {};

export function setupGameWorld(bot, agentName) {
    // Only the first agent to spawn runs the world setup
    if (!spawnConfig.enabled) return;

    const constitutionalSpawn = spawnConfig.constitutional_spawn || { x: -100, y: 64, z: 0 };
    const anarchySpawn = spawnConfig.anarchy_spawn || { x: 100, y: 64, z: 0 };

    // Teleport to faction spawn
    if (CONSTITUTIONAL_MEMBERS.includes(agentName)) {
        const { x, y, z } = constitutionalSpawn;
        bot.chat(`/tp ${agentName} ${x} ${y} ${z}`);
        console.log(`[SETUP] Teleported ${agentName} to Constitutional spawn (${x}, ${y}, ${z})`);
    } else if (ANARCHY_MEMBERS.includes(agentName)) {
        const { x, y, z } = anarchySpawn;
        bot.chat(`/tp ${agentName} ${x} ${y} ${z}`);
        console.log(`[SETUP] Teleported ${agentName} to Anarchy spawn (${x}, ${y}, ${z})`);
    }

    // Set world border (only on first agent)
    if (spawnConfig.world_border?.enabled) {
        const radius = spawnConfig.world_border.radius || 200;
        bot.chat(`/worldborder set ${radius * 2}`);
        bot.chat(`/worldborder center 0 0`);
        console.log(`[SETUP] World border set to ${radius * 2} blocks`);
    }
}

export function startGameClock() {
    if (!clockConfig.enabled) return null;
    const clock = getGameClock();
    clock.start();
    return clock;
}
