import settings from '../settings.js';
import prismarineViewer from 'prismarine-viewer';
const mineflayerViewer = prismarineViewer.mineflayer;

export function addBrowserViewer(bot, count_id, profileViewer) {
    if (!settings.render_bot_view) return;
    // B9: profile-level viewer config (e.g., observer prefers third-person) overrides global
    const vc = { ...(settings.viewer || {}), ...(profileViewer || {}) };
    mineflayerViewer(bot, {
        port: 3000 + count_id,
        firstPerson: vc.firstPerson !== undefined ? vc.firstPerson : true,
        viewDistance: vc.viewDistance || 3,
        width: vc.width || 512,
        height: vc.height || 384,
    });
}