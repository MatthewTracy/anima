/**
 * The Pantheon — cross-scenario soul archive.
 *
 * When ANY soul locks anywhere in Anima (Forum's Madison, Cloister's
 * Brother Bede, Outpost's Captain Reyes, Crew's Storm), an epitaph is
 * deterministically generated from the soul + death info and appended
 * to ./pantheon.md in the repo root.
 *
 * Future agents in ANY scenario read $PANTHEON — three random epitaphs
 * — as part of their prompt. The dead of one world become legend in
 * the next. No multi-agent LLM framework has cross-scenario shared
 * mythology like this.
 *
 * Why deterministic (no LLM): keeps the lock-on-death path zero-cost,
 * works offline, and the soul's motto already carries the voice.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const PANTHEON_PATH = './pantheon.md';
const PANTHEON_HEADER = `# The Pantheon

> *A cross-scenario archive of every soul ever locked in Anima. When an agent dies in any reference scenario, their epitaph is appended here. Future agents in any scenario read three random epitaphs at the start of their lives. The dead of one world become legend in the next.*

`;

/**
 * Generate a deterministic epitaph from a soul's content + death info.
 * Pulls the motto, the cause of death, and one line from the soul's
 * "What I have learned" or "My scars" sections (if present).
 */
export function generateEpitaph(name, soulContent, deathInfo, scenario) {
    const motto = _extractMotto(soulContent);
    const learned = _pickLineFromSection(soulContent, 'What I have learned');
    const scar = _pickLineFromSection(soulContent, 'My scars');
    const cause = deathInfo?.cause || 'cause unknown';
    const at = deathInfo?.at || null;

    const lines = [];
    lines.push(`### ${name}`);
    const flavor = scenario ? ` of the ${scenario}` : '';
    lines.push(`*${name}${flavor} — died ${cause}${at ? ` at ${typeof at === 'object' ? JSON.stringify(at) : at}` : ''}.*`);
    lines.push('');
    lines.push(`Their motto: "${motto}"`);
    if (learned) lines.push(`What they had learned: ${learned}`);
    if (scar) lines.push(`A scar they carried: ${scar}`);
    return lines.join('\n');
}

/**
 * Append an epitaph to ./pantheon.md. Best-effort — never throws.
 */
export function appendEpitaph(name, soulContent, deathInfo, scenario) {
    try {
        const epitaph = generateEpitaph(name, soulContent, deathInfo, scenario);
        const stamp = new Date().toISOString().slice(0, 10);
        const block = `\n\n## ${name} (${stamp})\n\n${epitaph}\n`;
        if (!existsSync(PANTHEON_PATH)) {
            writeFileSync(PANTHEON_PATH, PANTHEON_HEADER + block);
        } else {
            // Append. Read first to keep file legible across many runs.
            const existing = readFileSync(PANTHEON_PATH, 'utf8');
            writeFileSync(PANTHEON_PATH, existing + block);
        }
        return true;
    } catch (e) {
        console.warn(`[PANTHEON] Failed to append epitaph for ${name}: ${e.message}`);
        return false;
    }
}

/**
 * Read the pantheon and return all individual epitaph blocks (each a
 * "## <name> (<date>)\n\n### <name>\n..." section).
 */
export function readEpitaphs() {
    if (!existsSync(PANTHEON_PATH)) return [];
    try {
        const text = readFileSync(PANTHEON_PATH, 'utf8');
        // Split on the level-2 headings that introduce epitaphs.
        const parts = text.split(/^## /m).slice(1);   // first chunk is header preamble
        return parts.map(p => '## ' + p.trim());
    } catch (e) {
        console.warn(`[PANTHEON] Failed to read: ${e.message}`);
        return [];
    }
}

/**
 * Pick N random epitaphs and format for $PANTHEON placeholder.
 */
export function asPromptText(n = 3) {
    const all = readEpitaphs();
    if (all.length === 0) {
        return `=== THE PANTHEON ===\n(The pantheon is empty — no soul has yet been locked. You are early in this world's history. What you do here may be remembered.)\n=== END PANTHEON ===`;
    }
    const sampled = _sampleN(all, Math.min(n, all.length));
    const lines = ['=== THE PANTHEON — three of the dead, randomly recalled ==='];
    for (const e of sampled) lines.push(e);
    lines.push('=== END PANTHEON ===');
    return lines.join('\n\n');
}

// ── helpers ──────────────────────────────────────────────────────

function _extractMotto(text) {
    const m = (text || '').match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i);
    return m ? m[1] : '(motto unrecorded)';
}

function _pickLineFromSection(text, sectionTitle) {
    if (!text) return null;
    const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('##\\s*' + escaped + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)', 'i');
    const m = text.match(re);
    if (!m) return null;
    const body = m[1].trim();
    // Find bullet-pointed lines or one-liners. Skip empty placeholders.
    const candidates = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.match(/\(no .* yet/) && l.match(/[a-zA-Z]/));
    if (candidates.length === 0) return null;
    // Strip leading bullet markers
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return pick.replace(/^[-*•]\s*/, '').trim();
}

function _sampleN(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (out.length < n && copy.length > 0) {
        const idx = Math.floor(Math.random() * copy.length);
        out.push(copy.splice(idx, 1)[0]);
    }
    return out;
}
