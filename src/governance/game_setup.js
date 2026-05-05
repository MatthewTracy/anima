/**
 * GameSetup - Handles initial game world setup:
 * - Teleports factions to their spawn zones
 * - Places visual territory markers (#5)
 * - Spawn protection (#11)
 * - Governance nudges at scheduled times (#1)
 * - Low-HP broadcast monitoring (#6)
 * - Sets world border (optional)
 * - Starts the game clock
 */

import settings from '../../settings.js';
import { getGameClock } from './game_clock.js';
import { CONSTITUTIONAL_MEMBERS, ANARCHY_MEMBERS, getGovernanceManager } from './governance_manager.js';
import { getNarrativeLogger } from './narrative_logger.js';

const spawnConfig = settings.spawn || {};
const clockConfig = settings.game_clock || {};
const nudgeConfig = settings.governance_nudges || {};
const lowHpConfig = settings.low_hp_broadcast || {};

let _setupDone = false;          // ensure world-level setup only runs once
let _spawnProtectedAgents = new Set();
let _nudgeTimers = [];

/**
 * Per-agent spawn setup: teleport, schedule spawn protection,
 * register low-HP monitor, place territory markers (only on first agent).
 */
export function setupGameWorld(bot, agentName) {
    if (!spawnConfig.enabled) return;

    const constSpawn = spawnConfig.constitutional_spawn || { x: -100, y: 70, z: 0 };
    const anarchySpawn = spawnConfig.anarchy_spawn || { x: 100, y: 70, z: 0 };
    const isConst = CONSTITUTIONAL_MEMBERS.includes(agentName);
    const isAnarchy = ANARCHY_MEMBERS.includes(agentName);

    // Teleport this agent
    if (isConst) {
        const { x, y, z } = constSpawn;
        bot.chat(`/tp ${agentName} ${x} ${y} ${z}`);
        console.log(`[SETUP] Teleported ${agentName} to Constitutional spawn (${x}, ${y}, ${z})`);
    } else if (isAnarchy) {
        const { x, y, z } = anarchySpawn;
        bot.chat(`/tp ${agentName} ${x} ${y} ${z}`);
        console.log(`[SETUP] Teleported ${agentName} to Anarchy spawn (${x}, ${y}, ${z})`);
    }

    // #11 + B5: Spawn protection — full invulnerability for the configured duration.
    // Resistance 4 blocks physical damage, fire_resistance blocks fire/lava,
    // water_breathing prevents drowning, saturation prevents starvation.
    const protectSec = spawnConfig.spawn_protection_seconds || 0;
    if (protectSec > 0) {
        bot.chat(`/effect give ${agentName} minecraft:resistance ${protectSec} 4 true`);
        bot.chat(`/effect give ${agentName} minecraft:fire_resistance ${protectSec} 0 true`);
        bot.chat(`/effect give ${agentName} minecraft:water_breathing ${protectSec} 0 true`);
        bot.chat(`/effect give ${agentName} minecraft:saturation ${protectSec} 0 true`);
        _spawnProtectedAgents.add(agentName);
        setTimeout(() => _spawnProtectedAgents.delete(agentName), protectSec * 1000);
    }

    // #6: Low-HP faction broadcast — fires when this agent's HP drops below threshold
    if (lowHpConfig.enabled !== false) {
        let warned = false;
        const threshold = lowHpConfig.threshold || 8;
        bot.on('health', () => {
            if (bot.health <= threshold && !warned) {
                warned = true;
                const pos = bot.entity?.position;
                const posStr = pos ? `at ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}` : '';
                const faction = isConst ? 'CONSTITUTIONAL' : isAnarchy ? 'ANARCHY' : 'UNKNOWN';
                const msg = `[FACTION] ALERT: ${agentName} HP critical (${bot.health.toFixed(0)}/20) ${posStr}`;
                // Whisper to faction members
                const teammates = isConst ? CONSTITUTIONAL_MEMBERS : isAnarchy ? ANARCHY_MEMBERS : [];
                for (const m of teammates) {
                    if (m !== agentName) bot.whisper(m, msg);
                }
                console.log(`[LOW-HP] ${agentName}: ${msg}`);
                getNarrativeLogger().logChat(agentName, msg, false);
            }
            // Reset warning when HP recovers above threshold + 4
            if (bot.health > threshold + 4) warned = false;
        });
    }

    // World-level setup runs only ONCE for the entire game
    if (!_setupDone) {
        _setupDone = true;

        // Set world border
        if (spawnConfig.world_border?.enabled) {
            const radius = spawnConfig.world_border.radius || 200;
            bot.chat(`/worldborder set ${radius * 2}`);
            bot.chat(`/worldborder center 0 0`);
            console.log(`[SETUP] World border set to ${radius * 2} blocks`);
        }

        // #5: Place faction territory markers (beacon-style towers visible from far away)
        placeTerritoryMarkers(bot, constSpawn, anarchySpawn);

        // #1: Schedule governance nudges
        scheduleGovernanceNudges(bot);
    }
}

function placeTerritoryMarkers(bot, constSpawn, anarchySpawn) {
    // Constitutional zone: blue wool tower (constitutional = order = blue)
    const cs = constSpawn;
    bot.chat(`/setblock ${cs.x} ${cs.y - 1} ${cs.z} minecraft:beacon`);
    for (let i = 1; i <= 12; i++) {
        bot.chat(`/setblock ${cs.x} ${cs.y + i} ${cs.z} minecraft:blue_wool`);
    }
    // Anarchy zone: red wool tower
    const as = anarchySpawn;
    bot.chat(`/setblock ${as.x} ${as.y - 1} ${as.z} minecraft:beacon`);
    for (let i = 1; i <= 12; i++) {
        bot.chat(`/setblock ${as.x} ${as.y + i} ${as.z} minecraft:red_wool`);
    }
    // Mark contested zone corners with golden wool
    const cz = settings.spawn?.contested_zone || { xMin: -50, xMax: 50, zMin: -50, zMax: 50 };
    const corners = [
        [cz.xMin, cz.zMin], [cz.xMin, cz.zMax],
        [cz.xMax, cz.zMin], [cz.xMax, cz.zMax]
    ];
    for (const [x, z] of corners) {
        bot.chat(`/setblock ${x} 80 ${z} minecraft:gold_block`);
        for (let i = 1; i <= 5; i++) {
            bot.chat(`/setblock ${x} ${80 + i} ${z} minecraft:yellow_wool`);
        }
    }
    console.log(`[SETUP] Placed territory markers (blue=constitutional, red=anarchy, gold=contested corners)`);
}

function scheduleGovernanceNudges(bot) {
    if (!nudgeConfig.enabled) return;
    const schedule = nudgeConfig.schedule_seconds || [60, 180, 360, 600];

    const messages = {
        60:  '/say [60s] CONSTITUTIONAL: First member should !callElection("president") now. ANARCHY: consider !placeBounty on a constitutional agent.',
        180: '/say [3 min] No president yet? Hold an election. Constitutional faction must establish leadership to score points.',
        360: '/say [6 min] Halfway warning: have you passed any laws? Filed any lawsuits? Collected taxes? Time to act.',
        600: '/say [10 min] Last 5 minutes. Final laws, final raids, final scoring. Make it count.'
    };

    for (const seconds of schedule) {
        const msg = messages[seconds] || `/say [${seconds}s elapsed] Push your faction\\'s agenda.`;
        const t = setTimeout(() => {
            try {
                bot.chat(msg);
                console.log(`[NUDGE] T+${seconds}s: ${msg}`);
            } catch (e) { /* bot may have disconnected */ }
        }, seconds * 1000);
        _nudgeTimers.push(t);
    }
    console.log(`[SETUP] Scheduled ${schedule.length} governance nudges at T+${schedule.join(', ')}s`);
}

export function isSpawnProtected(agentName) {
    return _spawnProtectedAgents.has(agentName);
}

export function startGameClock() {
    if (!clockConfig.enabled) return null;
    const clock = getGameClock();
    clock.start();
    return clock;
}
