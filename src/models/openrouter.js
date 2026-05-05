import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { getBudgetGuard } from '../governance/budget_guard.js';

export class OpenRouter {
    static prefix = 'openrouter';
    constructor(model_name, url) {
        this.model_name = model_name;

        let config = {};
        config.baseURL = url || 'https://openrouter.ai/api/v1';

        const apiKey = getKey('OPENROUTER_API_KEY');
        if (!apiKey) {
            console.error('Error: OPENROUTER_API_KEY not found. Make sure it is set properly.');
        }

        // Pass the API key to OpenAI compatible Api
        config.apiKey = apiKey; 

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='*') {
        let messages = [{ role: 'system', content: systemMessage }, ...turns];
        messages = strictFormat(messages);

        // Choose a valid model from openrouter.ai (for example, "openai/gpt-4o")
        const pack = {
            model: this.model_name,
            messages,
            stop: stop_seq
        };

        let res = null;
        // C3: structured retry/backoff with error classification
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                console.log(`Awaiting openrouter api response... (attempt ${attempt}/${MAX_ATTEMPTS})`);
                let completion = await this.openai.chat.completions.create(pack);
                if (!completion?.choices?.[0]) {
                    console.error('No completion or choices returned:', completion);
                    res = 'No response received.';
                    break;
                }
                if (completion.choices[0].finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }
                console.log('Received.');
                res = completion.choices[0].message.content;

                if (completion.usage) {
                    const budget = getBudgetGuard();
                    const check = budget.recordUsage(
                        this.model_name,
                        completion.usage.prompt_tokens || 0,
                        completion.usage.completion_tokens || 0
                    );
                    if (!check.allowed) {
                        console.error(`[BUDGET GUARD] ${check.message}`);
                        process.exit(1);
                    }
                }
                break; // success
            } catch (err) {
                const msg = String(err?.message || err);
                const status = err?.status || err?.response?.status;
                let kind = 'unknown';
                let retryable = false;
                if (status === 401 || /api key|unauthorized/i.test(msg)) kind = 'invalid_key';
                else if (status === 429 || /rate limit|too many/i.test(msg)) { kind = 'rate_limit'; retryable = true; }
                else if (status === 408 || /timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(msg)) { kind = 'timeout'; retryable = true; }
                else if (/context length|too long/i.test(msg)) kind = 'context_too_long';
                else if (status >= 500 && status < 600) { kind = 'server_error'; retryable = true; }

                console.error(`[OpenRouter ${kind}] attempt ${attempt}/${MAX_ATTEMPTS}: ${msg}`);

                if (kind === 'invalid_key') {
                    console.error('[OpenRouter] FATAL: API key is invalid. Check keys.json.');
                    res = 'API key error. Operator must check configuration.';
                    break;
                }
                if (!retryable || attempt === MAX_ATTEMPTS) {
                    res = `My brain disconnected (${kind}), try again.`;
                    break;
                }
                // Exponential backoff: 2s, 4s, 8s
                const backoff = 2000 * Math.pow(2, attempt - 1);
                console.log(`[OpenRouter] Retrying in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
            }
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });
        
        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Openrouter.');
    }
}