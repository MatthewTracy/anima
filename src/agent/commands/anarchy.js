/**
 * Anarchy Commands - Actions available to Anarchy faction agents.
 * These are compound convenience commands that orchestrate existing actions
 * into faction-specific behaviors: raiding, sabotage, bounties, and looting.
 *
 * G1.5: governance state operations route through mindserver so all agents
 * share state. Faction-membership checks use the local module's array
 * (which is a constant — same in every process).
 */

import { getGovernanceManager } from '../../governance/governance_manager.js';
import { getNarrativeLogger } from '../../governance/narrative_logger.js';
import { callGovernanceOnMindserver, queryGovernanceOnMindserver } from '../mindserver_proxy.js';
import { broadcastAction } from '../witness.js';

async function govAction(method, ...args) {
    const r = await callGovernanceOnMindserver(method, args);
    if (r && r.success !== undefined) return r;
    try { const g = getGovernanceManager(); if (typeof g[method] === 'function') return g[method](...args); }
    catch (e) {}
    return { success: false, message: 'Could not reach governance manager.' };
}
async function govQuery(method, ...args) {
    const r = await queryGovernanceOnMindserver(method, args);
    if (r !== null && r !== undefined) return r;
    try { const g = getGovernanceManager(); if (typeof g[method] === 'function') return g[method](...args); }
    catch (e) {}
    return null;
}
function isAnarchy(name) {
    const g = getGovernanceManager();
    return g.isAnarchyMember(name);
}

export const anarchyActionsList = [
    {
        name: '!raid',
        description: 'Coordinate a raid on a target player. Announces to nearby anarchy allies and moves to attack. Anarchy faction only.',
        params: {
            'target': { type: 'string', description: 'The name of the player to raid.' }
        },
        perform: async function(agent, target) {
            if (!isAnarchy(agent.name)) return `${agent.name} is not an Anarchy faction member.`;
            agent.factionChat(`[RAID] ${agent.name} is raiding ${target}! Join the attack!`);
            await govAction('logEvent', 'raid_called', { raider: agent.name, target });
            getNarrativeLogger().logRaid(agent.name, target);
            broadcastAction(agent, 'raid', { target });
            return `Raid on ${target} announced! Use !attack("${target}") to engage in combat.`;
        }
    },
    {
        name: '!sabotage',
        description: 'Announce a sabotage mission against a target. Anarchy faction only.',
        params: {
            'target': { type: 'string', description: 'The name of the player whose structures to sabotage.' }
        },
        perform: async function(agent, target) {
            if (!isAnarchy(agent.name)) return `${agent.name} is not an Anarchy faction member.`;
            agent.factionChat(`[SABOTAGE] ${agent.name} is going to sabotage ${target}'s structures!`);
            await govAction('logEvent', 'sabotage_called', { saboteur: agent.name, target });
            getNarrativeLogger().logSabotage(agent.name, target);
            broadcastAction(agent, 'sabotage', { target });
            return `Sabotage mission against ${target} announced! Go to their location and break their blocks.`;
        }
    },
    {
        name: '!placeBounty',
        description: 'Place a bounty on a player. Offer a reward for their death. Anarchy faction only.',
        params: {
            'target': { type: 'string', description: 'The player to place a bounty on.' },
            'reward_item': { type: 'string', description: 'The item offered as reward.' },
            'reward_count': { type: 'int', description: 'How many items as reward.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: async function(agent, target, rewardItem, rewardCount) {
            const result = await govAction('placeBounty', agent.name, target, rewardItem, rewardCount);
            if (result.success) {
                agent.openChat(`[BOUNTY] ${result.message}`);
                getNarrativeLogger().logBountyPlaced(agent.name, target, rewardItem, rewardCount);
            }
            return result.message;
        }
    },
    {
        name: '!claimBounty',
        description: 'Claim a bounty after killing the target. Anarchy faction only.',
        params: {
            'bounty_id': { type: 'int', description: 'The bounty ID number.' }
        },
        perform: async function(agent, bountyId) {
            const result = await govAction('claimBounty', agent.name, bountyId);
            if (result.success) {
                agent.openChat(`[BOUNTY] ${result.message}`);
                getNarrativeLogger().logBountyClaimed(bountyId, agent.name);
            }
            return result.message;
        }
    },
    {
        name: '!anarchyChat',
        description: 'Send a private message only to anarchy faction members.',
        params: {
            'message': { type: 'string', description: 'The message to send to anarchy allies.' }
        },
        perform: async function(agent, message) {
            if (!isAnarchy(agent.name)) return `${agent.name} is not an Anarchy faction member.`;
            agent.factionChat(`[ANARCHY] ${agent.name}: ${message}`);
            return `Message sent to anarchy allies.`;
        }
    },
];

export const anarchyQueryList = [
    {
        name: '!viewActiveBounties',
        description: 'View all active bounties with rewards. Anarchy faction only.',
        params: {},
        perform: async function(agent) {
            const bounties = await govQuery('getActiveBounties');
            if (!bounties || bounties.length === 0) return 'No active bounties.';
            return 'Active Bounties:\n' + bounties.map(b =>
                `#${b.id}: Kill ${b.target} for ${b.rewardCount} ${b.rewardItem} (by ${b.placedBy})`
            ).join('\n');
        }
    },
];
