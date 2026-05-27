/**
 * Minecraft death-chat parser (v1.1.75).
 *
 * Minecraft emits canonical chat messages on every player death:
 *   "Madison was slain by Chaos"
 *   "Madison was shot by Chaos with arrow"
 *   "Madison was blown up by Chaos"
 *   "Madison drowned"
 *   "Madison fell from a high place"
 *
 * The killer-attributed forms always include "by <killer>". This helper
 * extracts the victim name when a caller wants to know "was I the killer?"
 * — used by agent.js's combat_kill credit path because mineflayer's
 * `entityDead` event does not reliably fire for player-vs-player kills.
 *
 * Returns the victim's name when the message names `candidateKillerName`
 * as the killer; null otherwise. Self-attribution (the candidate is also
 * the victim) is rejected so a "Madison was slain by Madison" never
 * credits Madison with killing herself.
 */

/** Escape a name for safe embedding in a regex. */
function escapeRegex(name) {
    return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractKillerFromDeathMessage(message, candidateKillerName) {
    if (typeof message !== 'string' || !message) return null;
    if (typeof candidateKillerName !== 'string' || !candidateKillerName) return null;
    const killerPattern = new RegExp(`\\bby\\s+${escapeRegex(candidateKillerName)}\\b`);
    if (!killerPattern.test(message)) return null;
    const victimMatch = message.match(/^(\w+)/);
    const victim = victimMatch ? victimMatch[1] : null;
    if (!victim || victim === candidateKillerName) return null;
    return victim;
}
