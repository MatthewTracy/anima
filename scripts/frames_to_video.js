#!/usr/bin/env node
/**
 * Frames to Video - Converts captured frame data (from record.js) into MP4 files
 * by writing JPEG frames to disk and piping them through ffmpeg.
 *
 * Requires ffmpeg installed and on PATH.
 * Install: https://ffmpeg.org/download.html (or `winget install ffmpeg` on Windows)
 *
 * Usage:
 *   node scripts/frames_to_video.js logs/videos/<session-id>
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { spawn } from 'child_process';

function findFfmpeg() {
    // Check if ffmpeg is on PATH
    return new Promise((resolve) => {
        const proc = spawn('ffmpeg', ['-version']);
        proc.on('error', () => resolve(false));
        proc.on('exit', (code) => resolve(code === 0));
    });
}

async function convertFrames(framesJsonPath) {
    const baseName = basename(framesJsonPath, '.frames.json');
    const dir = framesJsonPath.replace(/[/\\]+[^/\\]+$/, '');
    const tempDir = join(dir, `_temp_${baseName}`);
    const outputMp4 = join(dir, `${baseName}.mp4`);

    console.log(`\n[CONVERT] ${baseName}...`);

    const frames = JSON.parse(readFileSync(framesJsonPath, 'utf8'));
    if (frames.length === 0) {
        console.log(`  No frames. Skipping.`);
        return;
    }

    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

    // Write frames as JPEGs
    for (let i = 0; i < frames.length; i++) {
        const buf = Buffer.from(frames[i].data, 'base64');
        writeFileSync(join(tempDir, `frame_${String(i).padStart(6, '0')}.jpg`), buf);
    }
    console.log(`  Wrote ${frames.length} JPEG frames`);

    // Calculate framerate from frame timestamps
    const durationSec = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000;
    const fps = Math.max(1, Math.round(frames.length / Math.max(1, durationSec)));
    console.log(`  Duration: ${durationSec.toFixed(1)}s, ~${fps} fps`);

    // Run ffmpeg
    await new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-framerate', String(fps),
            '-i', join(tempDir, 'frame_%06d.jpg'),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', '23',
            outputMp4
        ];
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        });
        proc.on('error', reject);
    });

    // Cleanup
    rmSync(tempDir, { recursive: true, force: true });

    console.log(`  -> ${outputMp4}`);
}

async function main() {
    const sessionDir = process.argv[2];
    if (!sessionDir) {
        console.error('Usage: node scripts/frames_to_video.js <session_dir>');
        process.exit(1);
    }

    const hasFfmpeg = await findFfmpeg();
    if (!hasFfmpeg) {
        console.error('\nERROR: ffmpeg not found on PATH.\n');
        console.error('Install it:');
        console.error('  Windows: winget install ffmpeg  (or choco install ffmpeg)');
        console.error('  Or download from https://ffmpeg.org/download.html\n');
        console.error('The frame data is preserved in .frames.json files - you can convert later.\n');
        process.exit(1);
    }

    const files = readdirSync(sessionDir).filter(f => f.endsWith('.frames.json'));
    if (files.length === 0) {
        console.error(`No .frames.json files found in ${sessionDir}`);
        process.exit(1);
    }

    console.log(`Found ${files.length} recordings to convert.`);
    for (const f of files) {
        try {
            await convertFrames(join(sessionDir, f));
        } catch (e) {
            console.error(`Failed to convert ${f}: ${e.message}`);
        }
    }

    console.log('\n[CONVERT] Done. MP4 files are in:', sessionDir);
}

main();
