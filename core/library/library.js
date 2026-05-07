/**
 * The Library — searchable corpus of Anima's accumulated narrative.
 *
 * Every memoir, locked soul, scripture, manuscript, captain's log, and
 * earth log across all scenarios and games is a piece of the Library.
 * After 100 games you have a *world history* searchable by keyword.
 *
 * Why this matters: agents can ask "has anything like this happened
 * before?" and receive canonically-grounded passages from prior games.
 * Models how humans use HISTORY to inform NOW. Stanford's Generative
 * Agents had a memory store; Anima has a *library of accumulated lives*.
 *
 * STATUS (v0.28): plain text-search retrieval (substring + token-overlap
 * scoring). No embeddings yet — keeps the dependency footprint light.
 * A future version can plug in a real vector index without changing
 * the public API.
 *
 * Sources scanned:
 *   - bots/<name>/soul.md (current souls + locked souls)
 *   - bots/<name>/soul_history/*.md (every prior soul version)
 *   - logs/<scenario>/manuscript_*.md
 *   - logs/<scenario>/memoirs/<name>_*.md
 *   - logs/narratives/<sessionId>_memoirs/<name>.md (Forum)
 *   - scenarios/<name>/scripture.md, captains_log.md, earth_log.md
 *   - pantheon.md
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'i', 'you', 'he', 'she', 'we', 'they', 'it', 'me', 'us', 'them', 'his', 'her',
    'our', 'their', 'my', 'your', 'this', 'that', 'these', 'those', 'in', 'on',
    'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into', 'about', 'than',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'not', 'no', 'so', 'too', 'very', 'just', 'also'
]);

function _tokens(text) {
    return (text || '').toLowerCase().match(/[a-z]{3,}/g) || [];
}

function _overlapScore(query, doc) {
    const qTokens = new Set(_tokens(query).filter(t => !STOPWORDS.has(t)));
    if (qTokens.size === 0) return 0;
    const dTokens = _tokens(doc);
    let hits = 0;
    for (const t of dTokens) if (qTokens.has(t)) hits++;
    // Boost for substring match (helps for proper-noun queries like 'Madison')
    const subBoost = doc.toLowerCase().includes(query.toLowerCase().slice(0, 60)) ? 5 : 0;
    return hits + subBoost;
}

/**
 * Crawl all sources. Returns array of { path, source, kind, text }.
 * kind: soul | soul_history | memoir | manuscript | scripture | log | pantheon
 */
function _crawl() {
    const docs = [];

    // Souls + soul history
    const botsDir = './bots';
    if (existsSync(botsDir)) {
        for (const agent of readdirSync(botsDir)) {
            const agentDir = join(botsDir, agent);
            try { if (!statSync(agentDir).isDirectory()) continue; } catch { continue; }
            const soulPath = join(agentDir, 'soul.md');
            if (existsSync(soulPath)) {
                try { docs.push({ path: soulPath, source: agent, kind: 'soul', text: readFileSync(soulPath, 'utf8') }); }
                catch { /* skip */ }
            }
            const histDir = join(agentDir, 'soul_history');
            if (existsSync(histDir)) {
                try {
                    for (const f of readdirSync(histDir)) {
                        if (!f.endsWith('.md')) continue;
                        try { docs.push({ path: join(histDir, f), source: agent, kind: 'soul_history', text: readFileSync(join(histDir, f), 'utf8') }); }
                        catch { /* skip */ }
                    }
                } catch { /* skip */ }
            }
        }
    }

    // Manuscripts + per-scenario memoirs
    const logsDir = './logs';
    if (existsSync(logsDir)) {
        for (const scen of readdirSync(logsDir)) {
            const sd = join(logsDir, scen);
            try { if (!statSync(sd).isDirectory()) continue; } catch { continue; }
            // Manuscripts
            try {
                for (const f of readdirSync(sd)) {
                    if (!f.startsWith('manuscript_') || !f.endsWith('.md')) continue;
                    try { docs.push({ path: join(sd, f), source: scen, kind: 'manuscript', text: readFileSync(join(sd, f), 'utf8') }); }
                    catch { /* skip */ }
                }
            } catch { /* skip */ }
            // Memoirs subdir
            const memDir = join(sd, 'memoirs');
            if (existsSync(memDir)) {
                try {
                    for (const f of readdirSync(memDir)) {
                        if (!f.endsWith('.md')) continue;
                        try { docs.push({ path: join(memDir, f), source: scen, kind: 'memoir', text: readFileSync(join(memDir, f), 'utf8') }); }
                        catch { /* skip */ }
                    }
                } catch { /* skip */ }
            }
        }
        // Forum's narratives subdir (different layout)
        const narrDir = join(logsDir, 'narratives');
        if (existsSync(narrDir)) {
            try {
                for (const f of readdirSync(narrDir)) {
                    const fp = join(narrDir, f);
                    try {
                        if (statSync(fp).isDirectory() && f.endsWith('_memoirs')) {
                            for (const inner of readdirSync(fp)) {
                                if (!inner.endsWith('.md')) continue;
                                try { docs.push({ path: join(fp, inner), source: 'forum', kind: 'memoir', text: readFileSync(join(fp, inner), 'utf8') }); }
                                catch { /* skip */ }
                            }
                        } else if (f.endsWith('.md')) {
                            docs.push({ path: fp, source: 'forum', kind: 'manuscript', text: readFileSync(fp, 'utf8') });
                        }
                    } catch { /* skip */ }
                }
            } catch { /* skip */ }
        }
    }

    // Scenario-level persistent canons
    const canons = [
        { p: './scenarios/cloister/scripture.md', source: 'cloister', kind: 'scripture' },
        { p: './scenarios/outpost/earth_log.md', source: 'outpost', kind: 'log' },
        { p: './scenarios/crew/captains_log.md', source: 'crew', kind: 'log' },
        { p: './pantheon.md', source: 'cross', kind: 'pantheon' },
    ];
    for (const c of canons) {
        if (existsSync(c.p)) {
            try { docs.push({ path: c.p, source: c.source, kind: c.kind, text: readFileSync(c.p, 'utf8') }); }
            catch { /* skip */ }
        }
    }

    return docs;
}

/**
 * Search the Library by keyword/phrase. Returns top N matching passages
 * with score, source, kind, and a short excerpt.
 *
 * @param {string} query - free-text query
 * @param {object} [opts]
 * @param {number} [opts.n=5] - number of results
 * @param {Set<string>|string[]} [opts.kinds] - optional filter by kind
 * @returns {Array<{path, source, kind, score, excerpt}>}
 */
export function search(query, { n = 5, kinds = null } = {}) {
    if (!query) return [];
    const filter = kinds ? new Set(kinds) : null;
    const docs = _crawl();
    const candidates = docs
        .filter(d => !filter || filter.has(d.kind))
        .map(d => ({ ...d, score: _overlapScore(query, d.text) }))
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, n);

    return candidates.map(d => ({
        path: d.path,
        source: d.source,
        kind: d.kind,
        score: d.score,
        excerpt: _excerptForQuery(d.text, query, 280)
    }));
}

function _excerptForQuery(text, query, maxLen) {
    const lower = text.toLowerCase();
    const q = query.toLowerCase().slice(0, 40);
    const idx = lower.indexOf(q);
    if (idx >= 0) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(text.length, idx + q.length + 200);
        let snippet = text.slice(start, end).trim();
        if (start > 0) snippet = '…' + snippet;
        if (end < text.length) snippet = snippet + '…';
        return snippet.slice(0, maxLen);
    }
    return text.slice(0, maxLen).trim() + (text.length > maxLen ? '…' : '');
}

/**
 * Format search results for prompt injection — agents querying the
 * Library mid-game receive this text.
 */
export function asPromptText(query, opts = {}) {
    const results = search(query, opts);
    if (results.length === 0) {
        return `=== THE LIBRARY ===\nQuery: "${query}"\n(No prior passages found. This is unprecedented in the accumulated record.)\n=== END LIBRARY ===`;
    }
    const lines = [`=== THE LIBRARY — ${results.length} passage${results.length === 1 ? '' : 's'} matching "${query}" ===`];
    for (const r of results) {
        lines.push('');
        lines.push(`### ${r.source} / ${r.kind}    score=${r.score}`);
        lines.push(r.excerpt);
    }
    lines.push('=== END LIBRARY ===');
    return lines.join('\n');
}

/**
 * Stats on the Library — for inspector scripts.
 */
export function stats() {
    const docs = _crawl();
    const byKind = {};
    for (const d of docs) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    return {
        totalDocs: docs.length,
        byKind,
        totalChars: docs.reduce((sum, d) => sum + (d.text?.length || 0), 0)
    };
}
