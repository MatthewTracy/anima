/**
 * Default Mode Network — what the brain does when not actively task-focused.
 *
 * Real neuroscience: the DMN (Raichle 2001; Buckner et al. 2008;
 * Andrews-Hanna 2010) is a network of midline brain regions —
 * medial prefrontal, posterior cingulate, angular gyrus — that becomes
 * MORE active when an agent is idle, not less. It runs autobiographical
 * memory replay, future simulation, social rehearsal, self-referential
 * narrative. It's the substrate of "I keep thinking about…"
 *
 * Anima up to v0.48 had no analog. Between turns, agents had no inner
 * life — every prompt cycle, they re-derived their feelings from raw
 * data. That made affect "stateless from the agent's POV": the inner
 * monologue that real minds carry into each new moment was missing.
 *
 * v0.49 fills the gap with a DETERMINISTIC rumination synthesizer.
 * It does NOT call the LLM. Each turn (or between scenes), the runner
 * can call ruminate() to crystallize the agent's current affect log,
 * top beliefs, and recent moments into a brief first-person monologue.
 * The monologue is appended to bots/<name>/musings.md and exposed as
 * $MUSINGS for the next prompt cycle.
 *
 * Effect: the agent's prompt now contains continuity from inner state,
 * not just external events. Beliefs and feelings persist into the
 * agent's voice rather than being recalculated cleanly each turn.
 *
 * Background: Buckner & Carroll (2007) "Self-projection and the brain";
 * Spreng & Grady (2010) on DMN + autobiographical memory; Mason et al.
 * (2007) "Wandering minds: the default network and stimulus-independent
 * thought".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { AffectLog } from '../affect/affect.js';
import { BeliefTable } from '../beliefs/belief_table.js';
import { getFaction } from '../identity/faction.js';

const BOTS_DIR = './bots';
const MUSINGS_FILE = 'musings.md';
const MAX_MUSINGS_BYTES = 4000;     // last few entries only — DMN is short-loop

/**
 * Generate a brief inner monologue for `agentName` from current state.
 * Deterministic — same input → same output. Calls no LLM.
 *
 * @param {string} agentName
 * @param {object} [opts]
 * @param {boolean} [opts.persist=true]  Append to musings.md.
 * @returns {string} the monologue text (without timestamp), or '' if nothing
 *   to ruminate on (no affect, no beliefs).
 */
export function ruminate(agentName, opts = {}) {
    if (!agentName) return '';
    const { persist = true } = opts;

    const log = new AffectLog(agentName);
    const mood = log.currentMood();
    // v0.52: mood-congruent retrieval. The DMN is the substrate of
    // depression/elation spirals — what surfaces in idle thought is
    // shaped by the mood you carry into the silence.
    const top = log.congruentMoments(2);

    const beliefs = new BeliefTable(agentName);
    const ranked = beliefs.rankedTargets();
    const ally = ranked.length > 0 ? ranked[0] : null;
    const enemy = ranked.length > 0 ? ranked[ranked.length - 1] : null;
    const faction = getFaction(agentName);

    // If there's truly nothing — neutral mood, no beliefs, no events — skip.
    if (top.length === 0 && (!ally || ally.trust === 0)) return '';

    const lines = [];

    // Opening — mood-anchored self-statement
    lines.push(_moodOpener(mood, faction));

    // Beliefs — who I trust, who I distrust (only mention each if signal-bearing)
    const beliefLine = _beliefLine(ally, enemy);
    if (beliefLine) lines.push(beliefLine);

    // Replays — what keeps surfacing
    if (top.length > 0) {
        lines.push(_replayLine(top));
    }

    // Closing — what I expect from the next moment, anchored on mood
    lines.push(_closingLine(mood));

    const monologue = lines.join(' ');

    if (persist) {
        try {
            const dir = join(BOTS_DIR, agentName);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            const path = join(dir, MUSINGS_FILE);
            const stamp = new Date().toISOString();
            const entry = `\n## ${stamp}\n${monologue}\n`;
            appendFileSync(path, entry);
            _truncateMusings(path);
        } catch (e) {
            console.warn(`[DMN] Failed to persist musings for ${agentName}: ${e.message}`);
        }
    }

    return monologue;
}

/**
 * Read the last persisted musings entry (or empty string).
 */
export function readLatestMusings(agentName) {
    if (!agentName) return '';
    const path = join(BOTS_DIR, agentName, MUSINGS_FILE);
    if (!existsSync(path)) return '';
    try {
        const text = readFileSync(path, 'utf8');
        const entries = text.split(/\n## /).filter(s => s.trim());
        if (entries.length === 0) return '';
        const last = entries[entries.length - 1];
        // Strip leading timestamp line; keep just the body.
        const idx = last.indexOf('\n');
        return idx >= 0 ? last.slice(idx + 1).trim() : last.trim();
    } catch {
        return '';
    }
}

/**
 * For $MUSINGS placeholder. Returns a formatted monologue block, or a
 * short marker if nothing has been ruminated yet.
 */
export function asPromptText(agentName) {
    const m = readLatestMusings(agentName);
    if (!m) return '=== YOUR INNER MONOLOGUE ===\n(quiet — no recent thoughts settling.)\n=== END INNER MONOLOGUE ===';
    return `=== YOUR INNER MONOLOGUE — what's been on your mind ===\n${m}\n=== END INNER MONOLOGUE ===`;
}

/**
 * Test helper: clear the musings file.
 */
export function _clearMusings(agentName) {
    const path = join(BOTS_DIR, agentName, MUSINGS_FILE);
    if (existsSync(path)) {
        try { writeFileSync(path, ''); } catch { /* nonfatal */ }
    }
}

// ────────────────────────────────────────────────────────────────────
// Internal text synthesis. Templates are written for first-person voice
// without naming the agent (the agent IS the voice).
// ────────────────────────────────────────────────────────────────────

function _moodOpener(mood, faction) {
    const factionRef = (faction && faction !== 'unknown')
        ? ` Among the ${faction}, that's not nothing.`
        : '';
    switch (mood.label) {
        case 'devastated':
            return `Something inside me has not stopped sinking.${factionRef}`;
        case 'shaken':
            return `My hands are not steady yet.${factionRef}`;
        case 'tense':
            return `I cannot put down the feeling that something else is coming.${factionRef}`;
        case 'wary':
            return `I keep looking sideways at the door.${factionRef}`;
        case 'elated':
            return `For the first time in a while, I feel almost weightless.${factionRef}`;
        case 'hopeful':
            return `There is a small light I am turning toward.${factionRef}`;
        case 'settled':
        default:
            return `The world is quiet right now, and I am letting it be quiet.${factionRef}`;
    }
}

function _beliefLine(ally, enemy) {
    const parts = [];
    if (ally && ally.trust >= 0.3) {
        parts.push(`I think of ${ally.name} the way you think of someone you would still answer the door for at midnight.`);
    } else if (ally && ally.trust >= 0.05) {
        parts.push(`${ally.name} has, at least, not yet given me reason to step back.`);
    }
    if (enemy && enemy.trust <= -0.3 && (!ally || enemy.name !== ally.name)) {
        parts.push(`${enemy.name} I will not turn my back to.`);
    } else if (enemy && enemy.trust <= -0.05 && (!ally || enemy.name !== ally.name)) {
        parts.push(`${enemy.name} I am still cataloguing.`);
    }
    return parts.join(' ');
}

function _replayLine(top) {
    if (top.length === 0) return '';
    const m = top[0];
    const who = m.actor ? `${m.actor}` : 'someone';
    const verbed = _eventVerbal(m.type);
    const sign = m.valence < 0 ? 'still cuts' : 'still warms';
    if (top.length === 1) {
        return `One thing keeps coming back: ${who} ${verbed}, and the memory ${sign}.`;
    }
    const second = top[1];
    const who2 = second.actor ? `${second.actor}` : 'someone';
    const verbed2 = _eventVerbal(second.type);
    return `One thing keeps coming back: ${who} ${verbed}, and the memory ${sign}. Underneath that, the smaller note of ${who2} ${verbed2}.`;
}

function _closingLine(mood) {
    if (mood.valence <= -0.3) return `I will be careful with what I do next.`;
    if (mood.valence >= +0.3) return `I am letting myself, just briefly, hope.`;
    return `I am paying attention.`;
}

/**
 * Translate a system event-type into a short verbal phrase usable in
 * narrative prose. Intentionally simple — this is a stylistic veneer,
 * not semantics.
 */
function _eventVerbal(type) {
    const map = {
        attack_player:   'raised a hand against me',
        kill_player:     'took a life',
        flog:            'had me flogged',
        brig:            'put me in irons',
        release:         'let me go',
        divide_plunder:  'divided the spoils fairly',
        mutiny_call:     'called a mutiny',
        mutiny_succeed:  'overthrew the captain',
        vent:            'opened the airlock',
        lockdown:        'locked us in',
        repair:          'fixed what was broken',
        examine_crew:    'looked after one of us',
        contain:         'contained the threat',
        contain_fail:    'fumbled the containment',
        preach:          'preached a hard sermon',
        accuse:          'levelled an accusation',
        excommunicate:   'cast someone out',
        confess:         'confessed',
        fast:            'kept the fast',
        writeScripture:  'wrote down the words',
        forge:           'forged a paper',
        sabotage:        'set a fire',
        meet:            'met someone outside',
        leave_drop:      'left the drop',
        expel:           'cut a comrade loose',
        captured:        'was taken',
        broke:           'gave up names under questioning',
        lay_low:         'went still and silent',
        speak:           'said it out loud',
        confess_burden:  'told the truth they had been hiding'
    };
    return map[type] || `did ${type}`;
}

function _truncateMusings(path) {
    try {
        const text = readFileSync(path, 'utf8');
        if (Buffer.byteLength(text, 'utf8') <= MAX_MUSINGS_BYTES) return;
        // Keep last MAX_MUSINGS_BYTES bytes, but cut at a header boundary
        // so we don't slice mid-monologue.
        const tail = text.slice(-MAX_MUSINGS_BYTES);
        const cutAt = tail.indexOf('\n## ');
        if (cutAt >= 0) {
            writeFileSync(path, tail.slice(cutAt));
        } else {
            writeFileSync(path, tail);
        }
    } catch { /* nonfatal */ }
}
