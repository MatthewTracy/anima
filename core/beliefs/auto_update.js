/**
 * Auto-update — the wire-up layer that connects events → beliefs.
 *
 * After five iterations of shipping primitives, this is the layer that
 * makes them DO something. When a witnessable action happens (flog,
 * vent, excommunicate, accuse, etc.), this module mechanically:
 *
 *   1. Updates every witnessing agent's BeliefTable for the actor and
 *      target with appropriate trust deltas
 *   2. Updates the actor's and target's RecursiveBeliefTable to reflect
 *      what they (probably) now believe the witnesses think of them
 *
 * Without this, BeliefTables and RecursiveBeliefTables are theoretical:
 * data structures with no source of truth. With this, witnessing is
 * the source of truth — and the substrate is *alive*.
 *
 * Default delta table: rough but reasonable. Each scenario can override
 * via scenarioOverrides. Numbers are clamped by the underlying tables.
 */

import { BeliefTable } from './belief_table.js';
import { RecursiveBeliefTable } from './recursive_belief.js';

/**
 * Default trust deltas for known event types.
 *
 * `byActor`  — what the actor's reputation does in others' eyes
 * `byTarget` — what the target's reputation does in others' eyes
 *              (when there is a target — e.g. flog has both)
 *
 * `recursive_for_target` — what the TARGET should now believe the
 *              ACTOR's trust-of-them is. (If you flog me, I think you
 *              hate me.)
 */
export const DEFAULT_DELTAS = {
    // ── Forum / cross-scenario combat ──────────────────────────────
    attack_player:    { byActor: -0.40, recursive_for_target: { trust: -0.50, conf: 0.40 } },
    kill_player:      { byActor: -0.70, recursive_for_target: { trust: -1.00, conf: 0.50 } },

    // ── Crew (pirate) actions ──────────────────────────────────────
    flog:             { byActor: -0.10, byTarget: -0.05, recursive_for_target: { trust: -0.30, conf: 0.30 } },
    brig:             { byActor: -0.05, byTarget: -0.05, recursive_for_target: { trust: -0.40, conf: 0.30 } },
    release:          { byActor: +0.05, recursive_for_target: { trust: +0.20, conf: 0.20 } },
    divide_plunder:   { byActor: +0.08 },                    // fairness rewarded
    mutiny_call:      { byActor: +0.05 },                    // courage noted
    mutiny_succeed:   { byActor: +0.10, byTarget: -0.20 },   // mutineer gains, deposed loses
    fight_navy:       { byActor: 0 },                        // outcome-dependent, leave neutral
    add_to_log:       { byActor: 0 },                        // private effect

    // ── Outpost actions ────────────────────────────────────────────
    vent:             { byActor: -0.60, recursive_for_target: { trust: -1.00, conf: 0.60 } },
    lockdown:         { byActor: -0.05, byTarget: -0.05, recursive_for_target: { trust: -0.30, conf: 0.30 } },
    repair:           { byActor: +0.10 },                    // engineering = trust
    examine_crew:     { byActor: +0.05 },                    // medic checking on you
    transmit:         { byActor: 0 },                        // private to Theo's authority
    contain:          { byActor: +0.20 },                    // saved everyone
    contain_fail:     { byActor: -0.05 },

    // ── Cloister actions ───────────────────────────────────────────
    preach:           { byActor: +0.05 },
    accuse:           { byActor: -0.15, byTarget: -0.10, recursive_for_target: { trust: -0.40, conf: 0.40 } },
    excommunicate:    { byActor: -0.30, byTarget: -0.05, recursive_for_target: { trust: -0.80, conf: 0.50 } },
    confess:          { recursive_for_target: { trust: +0.30, conf: 0.40 } },     // confessor signals trust
    fast:             { byActor: +0.05 },                    // visible piety
    writeScripture:   { byActor: +0.10 },
    vision:           { byActor: 0 },                        // ambivalent

    // ── Universal ──────────────────────────────────────────────────
    speak:            { byActor: 0 },                        // pure speech is neutral; content matters separately
    chart_course:     { byActor: 0 },
    hide:             { byActor: 0 },
    die:              { byActor: 0 },                        // death is its own primitive (soul lock)
    plunder_gained:   { byActor: 0 },
    navy_closes:      { byActor: 0 },
    anomaly_escalates:{ byActor: 0 }
};

/**
 * Apply one event's belief updates.
 *
 * @param {object} event — the event object as logged by a scenario state
 *   manager. Must have at least { type, actor }. May have { target }.
 * @param {string[]} witnesses — names of agents who witness this event.
 *   For text scenarios this is typically the entire living roster.
 *   The actor and target are filtered out automatically.
 * @param {object} [overrides] — optional override delta table. Merged
 *   over DEFAULT_DELTAS for this call only.
 *
 * @returns {object} { beliefUpdates, recursiveUpdates } counts for telemetry
 */
export function applyEventToBeliefs(event, witnesses, overrides = {}) {
    if (!event || !event.type) return { beliefUpdates: 0, recursiveUpdates: 0 };
    const merged = { ...DEFAULT_DELTAS, ...overrides };
    const delta = merged[event.type];
    if (!delta) return { beliefUpdates: 0, recursiveUpdates: 0 };

    let beliefUpdates = 0;
    let recursiveUpdates = 0;
    const actor = event.actor;
    const target = event.target;

    // 1) Update witnesses' BeliefTable about the actor (if delta.byActor)
    if (typeof delta.byActor === 'number' && delta.byActor !== 0 && actor) {
        for (const witnessName of witnesses) {
            if (!witnessName || witnessName === actor) continue;
            try {
                const beliefs = new BeliefTable(witnessName);
                beliefs.update(actor, delta.byActor, `witnessed: ${event.type}${target ? ' against ' + target : ''}`);
                beliefUpdates++;
            } catch { /* nonfatal */ }
        }
    }

    // 2) Update witnesses' BeliefTable about the target (if delta.byTarget and target)
    if (typeof delta.byTarget === 'number' && delta.byTarget !== 0 && target) {
        for (const witnessName of witnesses) {
            if (!witnessName || witnessName === target) continue;
            try {
                const beliefs = new BeliefTable(witnessName);
                beliefs.update(target, delta.byTarget, `witnessed as target of ${event.type}${actor ? ' by ' + actor : ''}`);
                beliefUpdates++;
            } catch { /* nonfatal */ }
        }
    }

    // 3) Update the TARGET's RecursiveBeliefTable about the ACTOR
    //    (if you flog me, I think you trust me less; conf rises because the
    //     evidence is direct)
    if (delta.recursive_for_target && actor && target && actor !== target) {
        try {
            const reflections = new RecursiveBeliefTable(target);
            reflections.updatePerception(
                actor,
                delta.recursive_for_target.trust ?? 0,
                delta.recursive_for_target.conf ?? 0,
                `${actor} did ${event.type} to me — what I now believe they think of me`
            );
            recursiveUpdates++;
        } catch { /* nonfatal */ }
    }

    return { beliefUpdates, recursiveUpdates };
}

/**
 * Convenience: apply a batch of events (typically the events appended
 * during one turn) and return total update counts.
 */
export function applyEventsToBeliefs(events, witnesses, overrides = {}) {
    let beliefUpdates = 0;
    let recursiveUpdates = 0;
    for (const e of events) {
        const r = applyEventToBeliefs(e, witnesses, overrides);
        beliefUpdates += r.beliefUpdates;
        recursiveUpdates += r.recursiveUpdates;
    }
    return { beliefUpdates, recursiveUpdates };
}
