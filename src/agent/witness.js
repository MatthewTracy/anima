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
 *
 * v1.1.74: the pure logic (type-sets, formatter) lives in
 * witness_messages.js so tests can import it without dragging
 * mindserver_proxy (→ socket.io-client) into the graph. This file
 * stays thin: socket plumbing + the install handler.
 */

import { broadcastAgentActionToMindserver, onMindserverAgentAction } from './mindserver_proxy.js';
import {
    VIEW_DISTANCE, WITNESS_TYPES, ANNOUNCEMENT_TYPES, formatWitnessMessage,
} from './witness_messages.js';

// Re-export so existing callers (tests, other modules) keep working.
export { ANNOUNCEMENT_TYPES, WITNESS_TYPES, formatWitnessMessage };
// v1.1.74: pre-extract alias for tests that imported the private name.
export { formatWitnessMessage as _formatWitnessMessage };

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
                const msg = formatWitnessMessage(payload, 0);
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

            const msg = formatWitnessMessage(payload, dist);
            // System messages bypass the normal user/assistant loop; agents
            // just see them as fact. Use the agent's history.add hook with
            // role=system so this doesn't trigger an immediate response.
            agent.history.add('system', msg).catch(() => {});
        } catch { /* nonfatal */ }
    });
}
