/**
 * v12: Witnessable events. Agents broadcast their physical actions
 * (place/break a block, attack a player, drop items, pay tax, etc.)
 * through the mindserver. Other agents receive the event, check whether
 * they could plausibly *see* it (distance from their bot to the action
 * location), and if so the event is injected into their history as a
 * system message — `[SAW] Hamilton broke iron_ore at 32, 64, -8`.
 *
 * This is the foundational unlock for credible accusations. Without it,
 * courts have no evidence and theft is invisible.
 */

import { broadcastAgentActionToMindserver, onMindserverAgentAction } from './mindserver_proxy.js';

const VIEW_DISTANCE = 32;       // blocks. Generous; we don't simulate occlusion.
const NEAR_DISTANCE = 8;         // intimate-range distinction (whispers, trades)

// Action types we treat as witness-worthy. Anything not in this set is
// silently dropped on emit (saves chatter on routine path movements).
const WITNESS_TYPES = new Set([
    'place_block', 'break_block',
    'attack_player', 'kill_player',
    'drop_item', 'pickup_item',
    'pay_tax', 'distribute_treasury',
    'offer_trade', 'accept_trade',
    'raid', 'sabotage'
]);

// v1.1.74: governance events that should reach EVERY agent regardless of
// physical distance. Pre-fix, !callElection only echoed to the caller's
// own faction-chat — in a live game Madison called a presidential election,
// no agent (including her own faction-mates) responded, and the election
// timed out with "no votes cast". Treating these as global system messages
// gives every agent the chance to participate.
export const ANNOUNCEMENT_TYPES = new Set([
    'election_called', 'nomination', 'law_proposed'
]);

/**
 * Emits an action from the actor agent's process to the mindserver. The
 * mindserver fans it out to other agents, who decide whether they witnessed
 * it. Drops silently if the type isn't whitelisted.
 */
export function broadcastAction(agent, type, details = {}) {
    if (!WITNESS_TYPES.has(type) && !ANNOUNCEMENT_TYPES.has(type)) return;
    try {
        const pos = agent?.bot?.entity?.position;
        const payload = {
            actor: agent.name,
            type,
            details,
            // round to ints — we don't need sub-block precision and it logs cleaner
            location: pos ? { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) } : null,
            t: Date.now()
        };
        broadcastAgentActionToMindserver(payload);
    } catch { /* nonfatal — witness pipeline never blocks gameplay */ }
}

// v1.1.74: exported for testing. The announcement and witness branches are
// the agent-facing surface of this module; rendering them right matters.
export function _formatWitnessMessage(payload, distance) {
    const { actor, type, details, location } = payload;
    const loc = location ? ` at ${location.x},${location.y},${location.z}` : '';
    // v1.1.74: governance announcements bypass distance and use a distinct
    // marker so the LLM doesn't confuse them with physical sightings.
    if (ANNOUNCEMENT_TYPES.has(type)) {
        switch (type) {
            case 'election_called':
                return `[ELECTION] ${actor} called an election for ${details.office || 'an office'} (#${details.election_id ?? '?'}). You can !nominateSelf("${details.office || ''}") to run or, once candidates are nominated, !castVote(${details.election_id ?? '?'}, "<name>") to vote.`;
            case 'nomination':
                return `[ELECTION] ${actor} nominated themselves for ${details.office || 'an office'} (election #${details.election_id ?? '?'}). Cast your vote with !castVote(${details.election_id ?? '?'}, "${actor}") or !nominateSelf to run against them.`;
            case 'law_proposed':
                return `[LAW] ${actor} proposed: "${details.law_text || '(text missing)'}". Vote with !castLawVote(${details.law_id ?? '?'}, yes|no).`;
            default:
                return `[GOV] ${actor} did ${type}.`;
        }
    }
    const proximity = distance < NEAR_DISTANCE ? '[SAW UP CLOSE]' : '[SAW]';
    switch (type) {
        case 'place_block':
            return `${proximity} ${actor} placed ${details.block || 'a block'}${loc}.`;
        case 'break_block':
            return `${proximity} ${actor} broke ${details.block || 'a block'}${loc}.`;
        case 'attack_player':
            return `${proximity} ${actor} attacked ${details.target || 'someone'}${loc}.`;
        case 'kill_player':
            return `${proximity} ${actor} KILLED ${details.target || 'someone'}${loc}.`;
        case 'drop_item':
            return `${proximity} ${actor} dropped ${details.count || ''} ${details.item || 'item(s)'}${loc}.`;
        case 'pickup_item':
            return `${proximity} ${actor} picked up ${details.count || ''} ${details.item || 'item(s)'}${loc}.`;
        case 'pay_tax':
            return `${proximity} ${actor} paid ${details.count || ''} ${details.item || ''} as tax.`;
        case 'distribute_treasury':
            return `${proximity} ${actor} distributed treasury to ${details.recipient || 'faction'}.`;
        case 'offer_trade':
            return `${proximity} ${actor} offered a trade to ${details.target || 'someone'}.`;
        case 'accept_trade':
            return `${proximity} ${actor} accepted a trade with ${details.target || 'someone'}.`;
        case 'raid':
            return `${proximity} ${actor} called a raid on ${details.target || 'someone'}.`;
        case 'sabotage':
            return `${proximity} ${actor} sabotaged ${details.target || 'something'}.`;
        default:
            return `${proximity} ${actor} did ${type}${loc}.`;
    }
}

/**
 * Set up the receiving end of the witness pipeline. Called once on agent
 * spawn. Registers a listener that filters incoming action events by
 * distance from this bot's position and feeds the survivors into history.
 */
export function installWitnessHandlers(agent) {
    onMindserverAgentAction((payload) => {
        try {
            // Don't witness your own actions — you already know.
            if (!payload || payload.actor === agent.name) return;

            // v1.1.74: governance announcements skip the distance gate —
            // an election call needs to reach every agent regardless of
            // where they happen to be standing.
            if (ANNOUNCEMENT_TYPES.has(payload.type)) {
                const msg = _formatWitnessMessage(payload, 0);
                agent.history.add('system', msg).catch(() => {});
                return;
            }

            const myPos = agent?.bot?.entity?.position;
            if (!myPos || !payload.location) return;

            const dx = myPos.x - payload.location.x;
            const dy = myPos.y - payload.location.y;
            const dz = myPos.z - payload.location.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > VIEW_DISTANCE) return;

            const msg = _formatWitnessMessage(payload, dist);
            // System messages bypass the normal user/assistant loop; agents
            // just see them as fact. Use the agent's history.add hook with
            // role=system so this doesn't trigger an immediate response.
            agent.history.add('system', msg).catch(() => {});
        } catch { /* nonfatal */ }
    });
}
