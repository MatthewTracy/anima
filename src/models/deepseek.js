import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class DeepSeek {
    static prefix = 'deepseek';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;

        let config = {};

        config.baseURL = url || 'https://api.deepseek.com';
        config.apiKey = getKey('DEEPSEEK_API_KEY');

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        messages = strictFormat(messages);

        const pack = {
            model: this.model_name || "deepseek-chat",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting deepseek api response...')
            // console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.')
            res = completion.choices[0].message.content;
            // v1.1.60: guard null/empty content (same bug fixed in
            // openrouter.js — DeepSeek intermittently returns choices[0]
            // with message.content === null). Pre-fix this passed null
            // straight through and prompter.js threw on it, burning the
            // agent's turn. Return the soft-fail string so the caller's
            // retry loop can try again with a fresh prompt.
            if (res === null || res === undefined || (typeof res === 'string' && res.trim() === '')) {
                console.warn(`[DeepSeek] empty/null content (finish_reason=${completion.choices?.[0]?.finish_reason})`);
                res = 'My mind went blank, try again.';
            }
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Deepseek.');
    }
}



