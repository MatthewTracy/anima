#!/usr/bin/env node
/**
 * Anima Library Search — query the accumulated narrative.
 *
 * Usage:
 *   npm run library                              # show stats
 *   node scripts/library_search.js "<query>"     # full-text search
 *   node scripts/library_search.js "betrayal" --kinds soul,memoir
 */

import { search, stats } from '../core/library/library.js';

const args = process.argv.slice(2);
const kindsIdx = args.indexOf('--kinds');
const kindsArg = kindsIdx >= 0 ? args[kindsIdx + 1] : null;
// v1.1.33: when --kinds was absent, kindsIdx was -1 and `i !== kindsIdx + 1`
// excluded args[0] — silently dropping single-word queries like
// `library_search.js silence`. Only skip the kinds-value position when
// --kinds is actually present.
const query = args
    .filter((a, i) => !a.startsWith('--') && (kindsIdx < 0 || i !== kindsIdx + 1))
    .join(' ').trim();

function bar() { return '─'.repeat(70); }

if (!query) {
    const s = stats();
    console.log('');
    console.log('ANIMA — Library Stats');
    console.log(bar());
    console.log(`Total documents: ${s.totalDocs}`);
    console.log(`Total characters: ${s.totalChars.toLocaleString()}`);
    console.log('');
    console.log('By kind:');
    for (const [k, n] of Object.entries(s.byKind).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${k}`);
    }
    console.log('');
    console.log('Search:  node scripts/library_search.js "<query>"');
    console.log('Filter:  node scripts/library_search.js "<query>" --kinds soul,memoir');
    console.log('');
    process.exit(0);
}

const kinds = kindsArg ? kindsArg.split(',').map(s => s.trim()).filter(Boolean) : null;
const results = search(query, { n: 8, kinds });

console.log('');
console.log(`Library — search "${query}"${kinds ? `  (kinds: ${kinds.join(', ')})` : ''}`);
console.log(bar());

if (results.length === 0) {
    console.log('No matching passages found.');
    console.log('');
    process.exit(0);
}

for (const r of results) {
    console.log('');
    console.log(`[${r.score}] ${r.source} / ${r.kind}`);
    console.log(`    ${r.path}`);
    console.log(bar());
    console.log(r.excerpt);
}
console.log('');
