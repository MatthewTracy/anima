/**
 * Soul DNA — value-vector extraction from souls.
 *
 * Each soul.md contains free-text sections including "What I value" and
 * "What I have learned." This module extracts a deterministic VALUE
 * VECTOR from a soul — a small set of weighted axes (keyword-based
 * scoring) that captures the soul's drift toward various postures:
 *
 *   loyalty / autonomy
 *   doubt / certainty
 *   mercy / justice
 *   action / contemplation
 *   trust / suspicion
 *   tradition / change
 *
 * The DNA is a vector of weights in [-1, 1] for each axis. Two souls
 * with similar DNA are kindred spirits even if they've never met.
 *
 * Used for:
 *   - Finding kindred souls across scenarios (e.g. 'who in the pantheon
 *     was most like me?')
 *   - Tracking value-drift in one agent across many soul evolutions
 *     (compute DNA on each archived version, plot the trajectory)
 *   - Cross-LLM tournament analysis (does Claude tend to evolve toward
 *     loyalty while DeepSeek tends toward autonomy?)
 *
 * STATUS (v0.31): keyword-based extraction. No embeddings yet. Future
 * version can plug in vector embeddings without changing the public API.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const AXES = [
    {
        name: 'loyalty',
        opposite: 'autonomy',
        positive: ['loyal', 'loyalty', 'kin', 'tribe', 'faction', 'pact', 'oath', 'comrade', 'brother', 'duty', 'serve', 'defend'],
        negative: ['alone', 'solo', 'myself', 'independent', 'autonomy', 'free', 'unbound', 'leave', 'walk away']
    },
    {
        name: 'doubt',
        opposite: 'certainty',
        positive: ['doubt', 'question', 'wonder', 'unsure', 'might', 'perhaps', 'questioning', 'unsettled', 'hesitate'],
        negative: ['certain', 'sure', 'know', 'unwavering', 'resolute', 'orthodox', 'fixed', 'firm']
    },
    {
        name: 'mercy',
        opposite: 'justice',
        positive: ['mercy', 'forgive', 'spare', 'pity', 'compassion', 'understanding', 'grace'],
        negative: ['justice', 'punish', 'consequence', 'rule', 'enforce', 'penalty', 'condemn', 'execute', 'verdict']
    },
    {
        name: 'action',
        opposite: 'contemplation',
        positive: ['act', 'fight', 'do', 'strike', 'move', 'build', 'attack', 'engage', 'risk', 'venture'],
        negative: ['wait', 'watch', 'consider', 'reflect', 'silence', 'still', 'patient', 'pause', 'sit', 'observe']
    },
    {
        name: 'trust',
        opposite: 'suspicion',
        positive: ['trust', 'believe', 'rely', 'depend', 'faith', 'open', 'honest', 'transparent'],
        negative: ['suspect', 'distrust', 'doubt them', 'wary', 'guard', 'careful', 'paranoid', 'lie', 'deceive']
    },
    {
        name: 'tradition',
        opposite: 'change',
        positive: ['rule', 'precedent', 'process', 'tradition', 'custom', 'orthodox', 'ancestral', 'inherited', 'always done'],
        negative: ['change', 'reform', 'new', 'reform', 'amend', 'revise', 'progress', 'evolve', 'overturn', 'break']
    }
];

function _scoreText(text, axis) {
    if (!text) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const w of axis.positive) {
        const matches = lower.match(new RegExp(`\\b${w}\\b`, 'g'));
        if (matches) score += matches.length;
    }
    for (const w of axis.negative) {
        const matches = lower.match(new RegExp(`\\b${w}\\b`, 'g'));
        if (matches) score -= matches.length;
    }
    return score;
}

/**
 * Extract DNA from a soul's text content. Returns a normalized vector
 * with one entry per axis: { axis_name: weight in [-1, 1] }.
 *
 * Normalization: divide each axis score by max(|score| across all
 * axes for this soul), so the most-extreme axis is at ±1 and others
 * are proportional. This is shape-preserving rather than absolute.
 */
export function extractDNA(soulText) {
    if (!soulText || soulText.length < 20) return null;
    const raw = {};
    let maxAbs = 0;
    for (const axis of AXES) {
        const s = _scoreText(soulText, axis);
        raw[axis.name] = s;
        if (Math.abs(s) > maxAbs) maxAbs = Math.abs(s);
    }
    if (maxAbs === 0) {
        // Soul has no salient values yet — return zero vector
        const zeros = {};
        for (const axis of AXES) zeros[axis.name] = 0;
        return zeros;
    }
    const normalized = {};
    for (const axis of AXES) {
        normalized[axis.name] = Math.round((raw[axis.name] / maxAbs) * 100) / 100;
    }
    return normalized;
}

/**
 * Read DNA for an agent by name (loads their current soul.md).
 */
export function dnaOf(agentName) {
    const soulPath = `./bots/${agentName}/soul.md`;
    if (!existsSync(soulPath)) return null;
    try {
        const text = readFileSync(soulPath, 'utf8');
        return extractDNA(text);
    } catch { return null; }
}

/**
 * Cosine similarity between two DNA vectors. Returns value in [-1, 1].
 * 1 = identical direction, 0 = orthogonal, -1 = opposite.
 */
export function similarity(a, b) {
    if (!a || !b) return 0;
    let dot = 0, ma = 0, mb = 0;
    for (const axis of AXES) {
        const va = a[axis.name] || 0;
        const vb = b[axis.name] || 0;
        dot += va * vb;
        ma += va * va;
        mb += vb * vb;
    }
    if (ma === 0 || mb === 0) return 0;
    return Math.round((dot / (Math.sqrt(ma) * Math.sqrt(mb))) * 1000) / 1000;
}

/**
 * Format DNA for human readability — a compact line per axis.
 */
export function asPromptText(agentName) {
    const dna = dnaOf(agentName);
    if (!dna) return '';
    const lines = [`=== YOUR VALUE-DNA — distilled from your soul ===`];
    for (const axis of AXES) {
        const v = dna[axis.name];
        const sign = v > 0 ? '+' : '';
        const lean = v > 0.3 ? `lean toward ${axis.name}`
                   : v < -0.3 ? `lean toward ${axis.opposite}`
                   : 'balanced';
        lines.push(`  ${axis.name} ↔ ${axis.opposite}: ${sign}${v.toFixed(2)}  (${lean})`);
    }
    lines.push('=== END DNA ===');
    return lines.join('\n');
}

/**
 * Find the most-similar agents to the given one. Useful for "who in
 * the pantheon was most like me?" queries.
 *
 * @param {string} agentName
 * @param {number} [n=5]
 * @returns {Array<{name, similarity, dna}>}
 */
export function findKindred(agentName, n = 5) {
    const myDna = dnaOf(agentName);
    if (!myDna) return [];

    const botsDir = './bots';
    if (!existsSync(botsDir)) return [];

    const candidates = [];
    try {
        for (const other of readdirSync(botsDir)) {
            if (other === agentName) continue;
            const otherDir = join(botsDir, other);
            try { if (!statSync(otherDir).isDirectory()) continue; } catch { continue; }
            const otherDna = dnaOf(other);
            if (otherDna) {
                candidates.push({
                    name: other,
                    similarity: similarity(myDna, otherDna),
                    dna: otherDna
                });
            }
        }
    } catch { /* skip */ }

    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates.slice(0, n);
}
