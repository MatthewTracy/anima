#!/usr/bin/env node
/**
 * Anima Publish — turn one game's scattered outputs into a single
 * browsable markdown "issue."
 *
 * Anima ships excellent substrate but its outputs are scattered:
 *   logs/<scenario>/manuscript_*.md        the chronicle of one game
 *   logs/<scenario>/memoirs/<name>.md      first-person reflections
 *   bots/<name>/soul.md                    the agent's current soul
 *   bots/<name>/soul_history/<ts>.md       prior soul versions
 *   pantheon.md                            cross-scenario locked-soul archive
 *
 * Reading them requires 6 file opens. This script collapses one game's
 * full narrative — chronicle + every voice + every soul-drift + every
 * death — into ONE document worth posting.
 *
 * Usage:
 *   npm run publish                  # most recent manuscript across all scenarios
 *   node scripts/publish_game.js --scenario crew    # most recent crew game
 *   node scripts/publish_game.js --manuscript path  # explicit manuscript file
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';

const args = process.argv.slice(2);
const scenarioFlag = _flag(args, '--scenario');
const manuscriptFlag = _flag(args, '--manuscript');
const rosterFlag = _flag(args, '--roster');   // comma-separated override

// v0.37: roster discovery is now dynamic. We try in this order:
//   1. --roster flag override
//   2. scenarios/<scenario>/scenario.json's "roster" array
//   3. legacy hardcoded fallback (kept for backward compat with Forum)
const LEGACY_ROSTERS = {
    forum: ['Madison', 'Hamilton', 'Paine', 'Chaos', 'Wolf', 'Fox']
};

function _discoverRoster(scenarioName) {
    if (!scenarioName) return [];
    const manifestPath = `./scenarios/${scenarioName}/scenario.json`;
    if (existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (Array.isArray(manifest.roster) && manifest.roster.length > 0) {
                return manifest.roster.slice();
            }
        } catch { /* fall through to legacy */ }
    }
    return LEGACY_ROSTERS[scenarioName] || [];
}

function _flag(arr, name) {
    const i = arr.indexOf(name);
    if (i < 0) return null;
    return arr[i + 1] || null;
}

/**
 * Find the most recent manuscript_*.md across logs/. If --scenario is
 * given, restrict to that scenario's directory.
 */
function findMostRecentManuscript(scenarioFilter) {
    const candidates = [];
    const logsDir = './logs';
    if (!existsSync(logsDir)) return null;
    for (const d of readdirSync(logsDir)) {
        if (scenarioFilter && d !== scenarioFilter) continue;
        const dir = join(logsDir, d);
        try {
            if (!statSync(dir).isDirectory()) continue;
        } catch { continue; }
        let files;
        try { files = readdirSync(dir); } catch { continue; }
        for (const f of files) {
            if (!f.startsWith('manuscript_') || !f.endsWith('.md')) continue;
            const full = join(dir, f);
            try {
                const mtime = statSync(full).mtimeMs;
                candidates.push({ scenario: d, path: full, mtime });
            } catch { /* skip */ }
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0];
}

function readMemoirs(scenario, manuscriptStamp) {
    // memoirs live in logs/<scenario>/memoirs/ (Cloister/Outpost/Crew) or
    // logs/narratives/<sessionId>_memoirs/<name>.md (Forum)
    const memoirs = [];
    const localDir = `./logs/${scenario}/memoirs`;
    if (existsSync(localDir)) {
        for (const f of readdirSync(localDir)) {
            if (!f.endsWith('.md')) continue;
            try {
                const content = readFileSync(join(localDir, f), 'utf8');
                memoirs.push({ name: f.replace(/_\d{4}-\d{2}-\d{2}\.md$/, '').replace(/\.md$/, ''), content, source: f });
            } catch { /* skip */ }
        }
    }
    // Forum-style memoir directory
    const narrDir = './logs/narratives';
    if (existsSync(narrDir) && memoirs.length === 0) {
        // Pick the most recent _memoirs subdir
        const subdirs = readdirSync(narrDir).filter(d => d.endsWith('_memoirs'));
        subdirs.sort().reverse();
        if (subdirs.length > 0) {
            const sd = subdirs[0];
            const sdPath = join(narrDir, sd);
            for (const f of readdirSync(sdPath)) {
                if (!f.endsWith('.md') || f === 'README.md') continue;
                try {
                    const content = readFileSync(join(sdPath, f), 'utf8');
                    memoirs.push({ name: f.replace(/\.md$/, ''), content, source: `${sd}/${f}` });
                } catch { /* skip */ }
            }
        }
    }
    return memoirs;
}

function readSoulSnapshot(name) {
    const soulPath = `./bots/${name}/soul.md`;
    const histDir = `./bots/${name}/soul_history`;
    const diedPath = `./bots/${name}/_died.txt`;
    if (!existsSync(soulPath)) return null;
    let current = '';
    try { current = readFileSync(soulPath, 'utf8'); } catch { /* skip */ }
    let priorMotto = null;
    let priorDate = null;
    if (existsSync(histDir)) {
        try {
            const versions = readdirSync(histDir).filter(f => f.endsWith('.md')).sort();
            if (versions.length > 0) {
                const lastPrior = readFileSync(join(histDir, versions[versions.length - 1]), 'utf8');
                const m = lastPrior.match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i);
                priorMotto = m ? m[1] : null;
                priorDate = versions[versions.length - 1].replace(/\.md$/, '');
            }
        } catch { /* skip */ }
    }
    const isLocked = existsSync(diedPath);
    let deathInfo = null;
    if (isLocked) {
        try { deathInfo = readFileSync(diedPath, 'utf8'); } catch { /* skip */ }
    }
    const currentMottoMatch = current.match(/##\s*My motto\s*\n\s*"([^"\n]*)"/i);
    const currentMotto = currentMottoMatch ? currentMottoMatch[1] : '(no motto)';
    return { current, currentMotto, priorMotto, priorDate, isLocked, deathInfo };
}

function readPantheonRecent(n) {
    const path = './pantheon.md';
    if (!existsSync(path)) return [];
    try {
        const text = readFileSync(path, 'utf8');
        const parts = text.split(/^## /m).slice(1);
        return parts.slice(-n).map(p => '## ' + p.trim());
    } catch { return []; }
}

function buildIssue({ scenario, manuscriptPath, manuscriptText, memoirs, souls, recentEpitaphs }) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const lines = [];
    lines.push(`# ANIMA — ${scenario.toUpperCase()} ISSUE`);
    lines.push('');
    lines.push(`*Published ${new Date().toUTCString()}*`);
    lines.push(`*Source manuscript: ${basename(manuscriptPath)}*`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Table of contents');
    lines.push('');
    lines.push('1. Chronicle');
    lines.push('2. Memoirs');
    lines.push('3. Soul snapshots — drift since last game');
    lines.push('4. Pantheon — recent dead');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 1. Chronicle');
    lines.push('');
    lines.push(manuscriptText.trim());
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 2. Memoirs');
    lines.push('');
    if (memoirs.length === 0) {
        lines.push('*(No memoirs recorded for this game.)*');
    } else {
        for (const m of memoirs) {
            lines.push(`### ${m.name}`);
            lines.push('');
            lines.push(m.content.trim());
            lines.push('');
        }
    }
    lines.push('---');
    lines.push('');
    lines.push('## 3. Soul snapshots — drift since last game');
    lines.push('');
    if (souls.length === 0) {
        lines.push('*(No soul snapshots available — agents have not been seeded yet.)*');
    } else {
        for (const s of souls) {
            const lockTag = s.isLocked ? ' — **LOCKED (dead)**' : '';
            lines.push(`### ${s.name}${lockTag}`);
            lines.push('');
            if (s.priorMotto && s.priorMotto !== s.currentMotto) {
                lines.push(`**Motto drift:** "${s.priorMotto}" → "${s.currentMotto}"`);
                lines.push('');
            } else if (s.priorMotto) {
                lines.push(`**Motto unchanged:** "${s.currentMotto}"`);
                lines.push('');
            } else {
                lines.push(`**Motto:** "${s.currentMotto}" *(first soul — no prior to compare)*`);
                lines.push('');
            }
            lines.push('<details><summary>Full current soul</summary>');
            lines.push('');
            lines.push(s.current.trim());
            lines.push('');
            lines.push('</details>');
            lines.push('');
            if (s.isLocked && s.deathInfo) {
                lines.push('```');
                lines.push(s.deathInfo.trim());
                lines.push('```');
                lines.push('');
            }
        }
    }
    lines.push('---');
    lines.push('');
    lines.push('## 4. Pantheon — recent dead');
    lines.push('');
    if (recentEpitaphs.length === 0) {
        lines.push('*(The pantheon is empty — no soul has yet been locked across any scenario.)*');
    } else {
        for (const ep of recentEpitaphs) {
            lines.push(ep);
            lines.push('');
        }
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Generated by `npm run publish`. Anima v0.16+.*');
    return { content: lines.join('\n'), stamp };
}

function main() {
    let manuscript;
    if (manuscriptFlag) {
        if (!existsSync(manuscriptFlag)) {
            console.error(`Manuscript not found: ${manuscriptFlag}`);
            process.exit(1);
        }
        const dirName = basename(dirname(manuscriptFlag));
        manuscript = { scenario: dirName, path: manuscriptFlag };
    } else {
        manuscript = findMostRecentManuscript(scenarioFlag);
    }
    if (!manuscript) {
        console.error('No manuscripts found in logs/. Run a scenario first (npm run cloister, etc.).');
        process.exit(1);
    }

    const manuscriptText = readFileSync(manuscript.path, 'utf8');
    const memoirs = readMemoirs(manuscript.scenario, manuscript.path);
    const roster = rosterFlag
        ? rosterFlag.split(',').map(s => s.trim()).filter(Boolean)
        : _discoverRoster(manuscript.scenario);
    const souls = roster.map(name => {
        const snap = readSoulSnapshot(name);
        return snap ? { name, ...snap } : null;
    }).filter(Boolean);
    const recentEpitaphs = readPantheonRecent(6);

    const { content, stamp } = buildIssue({
        scenario: manuscript.scenario,
        manuscriptPath: manuscript.path,
        manuscriptText,
        memoirs,
        souls,
        recentEpitaphs
    });

    const outDir = './site';
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `issue_${manuscript.scenario}_${stamp}.md`);
    writeFileSync(outPath, content);
    console.log(`[PUBLISH] Issue written: ${outPath}`);
    console.log(`[PUBLISH] Source: ${manuscript.path}`);
    console.log(`[PUBLISH] Memoirs: ${memoirs.length}`);
    console.log(`[PUBLISH] Souls: ${souls.length} (${souls.filter(s => s.isLocked).length} locked)`);
    console.log(`[PUBLISH] Pantheon entries: ${recentEpitaphs.length}`);
}

main();
