import settings from '../settings.js';
import prismarineViewer from 'prismarine-viewer';
const mineflayerViewer = prismarineViewer.mineflayer;

export function addBrowserViewer(bot, count_id) {
    if (!settings.render_bot_view) return;
    const vc = settings.viewer || {};
    mineflayerViewer(bot, {
        port: 3000 + count_id,
        firstPerson: vc.firstPerson !== undefined ? vc.firstPerson : true,
        viewDistance: vc.viewDistance || 3,
        width: vc.width || 512,
        height: vc.height || 384,
    });
}