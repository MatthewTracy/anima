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
import { getStress, stressLevel } from './allostatic_load.js';
import { detectDissonance, detectPride } from './dissonance.js';

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
    // v0.56: allostatic load — when the body is overloaded, the inner
    // monologue is colored by exhaustion before mood even gets a turn.
    const load = getStress(agentName);
    const level = stressLevel(load);

    // If there's truly nothing — neutral mood, no beliefs, no events,
    // and no body state to speak of — skip.
    if (top.length === 0 && (!ally || ally.trust === 0) && level === 'baseline') return '';

    const lines = [];

    // Opening — body-load takes priority over mood when overloaded;
    // otherwise mood-anchored self-statement.
    if (level === 'overloaded') {
        lines.push(_overloadedOpener(faction));
    } else {
        lines.push(_moodOpener(mood, faction));
        if (level === 'allostatic') {
            lines.push(`I have not had a clean breath in a while.`);
        }
    }

    // v0.74: cognitive dissonance (Festinger 1957). v0.78: now shares the
    // detection with soul evolution via core/cognition/dissonance.js.
    // v1.1: pride detection — symmetric counterpart so agents can
    // acknowledge value-aligned actions, not just brood on misaligned ones.
    // Dissonance takes precedence when both fire (the body remembers
    // wrong-action more loudly than right-action — Festinger's asymmetry).
    const dis = detectDissonance(agentName, { recentN: 10 });
    if (dis.level === 'loud') {
        lines.push(`I have lately done things I cannot reconcile with who I thought I was.`);
    } else if (dis.level === 'soft') {
        lines.push(`One thing I did sits in me wrong.`);
    } else {
        const pride = detectPride(agentName, { recentN: 10 });
        if (pride.level === 'loud') {
            lines.push(`I have done things lately that I am quietly proud of.`);
        } else if (pride.level === 'soft') {
            lines.push(`There is one thing I did that sits well with me.`);
        }
    }

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

function _overloadedOpener(faction) {
    const factionRef = (faction && faction !== 'unknown')
        ? ` Even among the ${faction}, I have nothing left to give right now.`
        : '';
    return `My nervous system is past what it can hold.${factionRef}`;
}

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
    if (top.length === 1) {
        return `One thing keeps coming back: ${_phraseOne(top[0])}.`;
    }
    return `One thing keeps coming back: ${_phraseOne(top[0])}. Underneath that, the smaller note of ${_phraseTwo(top[1])}.`;
}

/**
 * v0.54: phrase a moment in a way that respects whether the agent was
 * the target/actor of the event, a witness, or felt it vicariously
 * through someone they cared about. Empathy reads differently from
 * direct experience and we want the inner monologue to say so.
 */
function _phraseOne(m) {
    const who    = m.actor ? `${m.actor}` : 'someone';
    const target = m.target;
    const cuts   = m.valence < 0 ? 'still cuts' : 'still warms';

    // v0.70: pick the verb perspective based on the speaker's relation to
    // the event. 'self' assumes the speaker IS the target ("raised a hand
    // against me"). 'other' phrases the same act without claiming the
    // speaker as target ("raised a hand"), used for vicarious moments
    // where we name the actual target separately.
    if (m.role === 'vicarious' && target) {
        const verbed = _eventVerbal(m.type, 'other');
        if (m.valence < 0) {
            return `what ${target} had to live through when ${who} ${verbed}, and the ache that left in me ${cuts}`;
        }
        return `the strange small relief I felt when ${who} ${verbed} against ${target}, and that ${cuts}`;
    }
    if (m.role === 'target') {
        const verbed = _eventVerbal(m.type, 'self');
        return `${who} ${verbed}, and the memory ${cuts}`;
    }
    if (m.role === 'actor') {
        const verbed = _eventVerbal(m.type, 'other');
        return `what I myself did — ${verbed} — and how that ${cuts}`;
    }
    // witness
    const verbed = _eventVerbal(m.type, 'other');
    return `${who} ${verbed}, and the memory ${cuts}`;
}

function _phraseTwo(m) {
    const who    = m.actor ? `${m.actor}` : 'someone';
    const target = m.target;
    if (m.role === 'vicarious' && target) {
        const verbed = _eventVerbal(m.type, 'other');
        return m.valence < 0
            ? `what was done to ${target}`
            : `the quieter justice when ${who} ${verbed} against ${target}`;
    }
    if (m.role === 'actor') {
        const verbed = _eventVerbal(m.type, 'other');
        return `my own hand in ${verbed}`;
    }
    const verbed = _eventVerbal(m.type, 'other');
    return `${who} ${verbed}`;
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
 *
 * v0.70: optional `perspective` parameter. 'self' (default) phrases the
 * verb as if the speaker IS the target ("raised a hand against me");
 * 'other' phrases without claiming the speaker as target ("raised a
 * hand"), used for vicarious / actor / bystander rumination where the
 * actual target is named separately.
 */
function _eventVerbal(type, perspective = 'self') {
    const SELF = {
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
    const OTHER = {
        attack_player:   'raised a hand',
        kill_player:     'took a life',
        flog:            'ordered the flogging',
        brig:            'sent them to the brig',
        release:         'let them go',
        divide_plunder:  'divided the spoils',
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
        excommunicate:   'cast them out',
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
    const map = perspective === 'other' ? OTHER : SELF;
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
