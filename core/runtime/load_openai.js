/**
 * Lazy loader for the optional 'openai' npm package.
 *
 * Multiple modules in the substrate (Director, soul evolution, end-of-game
 * memoirs, post-game summary, reflection, scenario runners) call OpenAI-
 * compatible endpoints. They each used to do `import OpenAIApi from 'openai'`
 * at module top, which crashed any consumer (tests, inspectors, future
 * utilities) that imported the file without the npm package installed.
 *
 * v1.1.35 fixed director.js with an inline dynamic import. v1.1.45 did
 * the same for autobiographies.js. v1.1.46 generalizes the fix into one
 * helper so the remaining six files don't duplicate the try/catch.
 *
 * Usage:
 *   const OpenAIApi = await loadOpenAI();
 *   if (!OpenAIApi) return null;   // package missing, caller decides what to do
 *   const client = new OpenAIApi({ baseURL: ..., apiKey: ... });
 *
 * The first failed load is sticky — subsequent calls return null without
 * retrying, so you don't get repeated console warnings on every call site
 * during a single process lifetime.
 */

let cachedOpenAI = null;
let loadFailed = false;

export async function loadOpenAI() {
    if (cachedOpenAI) return cachedOpenAI;
    if (loadFailed) return null;
    try {
        const mod = await import('openai');
        cachedOpenAI = mod.default || mod;
        return cachedOpenAI;
    } catch (e) {
        loadFailed = true;
        console.warn(`[OPENAI] 'openai' npm package not installed — LLM calls disabled (${e.message})`);
        return null;
    }
}
