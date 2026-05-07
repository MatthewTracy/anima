#!/usr/bin/env node
/**
 * Record - Captures video footage from all agent camera feeds and the dashboard.
 *
 * Uses Puppeteer to launch headless Chrome instances, open each camera feed,
 * and record the visible area as video. Saves WebM files to logs/videos/.
 *
 * Usage:
 *   node scripts/record.js [duration_minutes]
 *
 * By default records for the game clock duration (from settings.js).
 * Records all 10 agents + the dashboard in parallel.
 *
 * Output files:
 *   logs/videos/<sessionId>/dashboard.webm
 *   logs/videos/<sessionId>/Madison.webm
 *   logs/videos/<sessionId>/Hamilton.webm
 *   ...
 */

// v1.1.11: dynamic puppeteer import. puppeteer is optional and not in
// package.json — declaring it as a top-level import meant any code that
// did `import './scripts/record.js'` (e.g. for testing or hygiene checks)
// crashed with "Cannot find package 'puppeteer'". Loading dynamically
// inside main() means the script only fails when the user actually runs
// it, with a clearer error message if puppeteer is missing.
import { mkdirSync, existsSync, createWriteStream } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import settings from '../settings.js';

const AGENTS = [
    { name: 'Madison', port: 3000 },
    { name: 'Hamilton', port: 3001 },
    { name: 'Paine', port: 3002 },
    { name: 'Marshall', port: 3003 },
    { name: 'Franklin', port: 3004 },
    { name: 'Chaos', port: 3005 },
    { name: 'Wolf', port: 3006 },
    { name: 'Fox', port: 3007 },
    { name: 'Bear', port: 3008 },
    { name: 'Raven', port: 3009 },
];

const DASHBOARD = { name: 'dashboard', port: settings.mindserver_port || 8080 };

async function recordTarget(target, sessionDir, durationMs) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    const url = `http://localhost:${target.port}`;
    console.log(`[RECORD] ${target.name}: opening ${url}`);

    try {
        await page.goto(url, { timeout: 10000, waitUntil: 'networkidle2' });
    } catch (e) {
        console.warn(`[RECORD] ${target.name}: page load warning (${e.message}), proceeding anyway`);
    }

    const outputFile = join(sessionDir, `${target.name}.webm`);
    const client = await page.target().createCDPSession();

    // Set up screencast
    const frameStream = createWriteStream(outputFile.replace('.webm', '.frames.json'));
    frameStream.write('[\n');
    let frameCount = 0;
    let firstFrame = true;

    client.on('Page.screencastFrame', async (frame) => {
        if (!firstFrame) frameStream.write(',\n');
        firstFrame = false;
        frameStream.write(JSON.stringify({ timestamp: Date.now(), data: frame.data }));
        frameCount++;
        try {
            await client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
        } catch (e) { /* ignore */ }
    });

    await client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 60,
        everyNthFrame: 4 // ~7.5 fps
    });

    console.log(`[RECORD] ${target.name}: recording started (${(durationMs / 60000).toFixed(1)} min)`);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    try { await client.send('Page.stopScreencast'); } catch (e) { /* ignore */ }
    frameStream.write('\n]');
    frameStream.end();

    await browser.close();
    console.log(`[RECORD] ${target.name}: captured ${frameCount} frames -> ${outputFile.replace('.webm', '.frames.json')}`);

    return { agent: target.name, frames: frameCount, output: outputFile };
}

// v1.1.11: dynamic puppeteer load + clear error if missing.
let puppeteer;
async function loadPuppeteer() {
    if (puppeteer) return puppeteer;
    try {
        ({ default: puppeteer } = await import('puppeteer'));
        return puppeteer;
    } catch (e) {
        console.error('[RECORD] puppeteer is not installed. Install it with:');
        console.error('  npm install puppeteer');
        console.error('Then re-run npm run record.');
        process.exit(2);
    }
}

async function main() {
    await loadPuppeteer();
    const duration = parseFloat(process.argv[2]) || (settings.game_clock?.duration_minutes || 30);
    const durationMs = duration * 60 * 1000;

    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionDir = join('./logs/videos', sessionId);
    if (!existsSync(sessionDir)) mkdirSync(sessionDir, { recursive: true });

    console.log(`[RECORD] Session: ${sessionId}`);
    console.log(`[RECORD] Recording ${AGENTS.length} agents + dashboard for ${duration} minutes`);
    console.log(`[RECORD] Output: ${sessionDir}\n`);

    // Give the game server some time to start up if this is run right after `node main.js`
    console.log('[RECORD] Waiting 20s for agents to spawn...');
    await new Promise(r => setTimeout(r, 20000));

    const targets = [DASHBOARD, ...AGENTS];
    const results = await Promise.allSettled(
        targets.map(t => recordTarget(t, sessionDir, durationMs))
    );

    console.log('\n[RECORD] Recording complete. Results:');
    for (const r of results) {
        if (r.status === 'fulfilled') {
            console.log(`  ${r.value.agent}: ${r.value.frames} frames`);
        } else {
            console.log(`  FAILED: ${r.reason?.message || r.reason}`);
        }
    }

    console.log(`\n[RECORD] Frame data saved to: ${sessionDir}`);
    console.log(`[RECORD] To convert to MP4, run: node scripts/frames_to_video.js ${sessionDir}`);
}

// v1.1.11: gate top-level execution on isMainModule (same pattern as
// scripts/replay.js) so importing this file (e.g. for the package-
// scripts hygiene test) does not actually run main().
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    main().catch(err => {
        console.error('[RECORD] Error:', err);
        process.exit(1);
    });
}
