export function stringifyTurns(turns) {
    let res = '';
    for (let turn of turns) {
        if (turn.role === 'assistant') {
            res += `\nYour output:\n${turn.content}`;
        } else if (turn.role === 'system') {
            res += `\nSystem output: ${turn.content}`;
        } else {
            res += `\nUser input: ${turn.content}`;
        
        }
    }
    return res.trim();
}

export function toSinglePrompt(turns, system=null, stop_seq='***', model_nickname='assistant') {
    let prompt = system ? `${system}${stop_seq}` : '';
    let role = '';
    turns.forEach((message) => {
        role = message.role;
        if (role === 'assistant') role = model_nickname;
        prompt += `${role}: ${message.content}${stop_seq}`;
    });
    if (role !== model_nickname) // if the last message was from the user/system, add a prompt for the model. otherwise, pretend we are extending the model's own message
        prompt += model_nickname + ": ";
    return prompt;
}

function _getWords(text) {
    return text.replace(/[^a-zA-Z ]/g, '').toLowerCase().split(' ');
}

export function wordOverlapScore(text1, text2) {
    const words1 = _getWords(text1);
    const words2 = _getWords(text2);
    const intersection = words1.filter(word => words2.includes(word));
    return intersection.length / (words1.length + words2.length - intersection.length);
}

/**
 * v1.1.63: Normalize an LLM completion's content. Providers intermittently
 * return null/empty content (model emitted only reasoning tokens, hit a soft
 * content filter, or a transient upstream hiccup). Returning that raw null
 * downstream makes prompter.js throw "Generated response is not a string",
 * burning the agent's whole turn — observed repeatedly in a live Forum run.
 *
 * v1.1.60 inline-guarded openrouter.js + deepseek.js; v1.1.63 routes the
 * other nine wrappers through this shared helper. Returns a soft-fail string
 * the caller's retry loop can recover from instead of crashing on null.
 *
 * @param {*} content - completion.choices[0].message.content (may be null)
 * @param {string} [modelLabel] - provider label for the warning log
 * @returns {string} the content, or a soft-fail string if it was empty/null
 */
// v1.1.74: exported so callers (promptConvo, tests) can detect a soft-fail
// without string-matching. Pre-fix, the prompter retry loop accepted the
// soft-fail as a valid generation, so 3 consecutive null LLM responses
// resulted in 3 valid-looking SOFT_FAIL replies and the agent went idle
// for the rest of the game. promptConvo now `continue`s on this sentinel.
export const SOFT_FAIL_RESPONSE = 'My mind went blank, try again.';

export function normalizeContent(content, modelLabel = 'model') {
    if (content === null || content === undefined ||
        (typeof content === 'string' && content.trim() === '')) {
        console.warn(`[${modelLabel}] empty/null content — returning soft-fail`);
        return SOFT_FAIL_RESPONSE;
    }
    return content;
}

// ensures stricter turn order and roles:
// - system messages are treated as user messages and prefixed with SYSTEM:
// - combines repeated messages from users
// - separates repeat assistant messages with filler user messages
export function strictFormat(turns) {
    let prev_role = null;
    let messages = [];
    let filler = {role: 'user', content: '_'};
    for (let msg of turns) {
        if (typeof msg.content === 'string')  {
            msg.content = msg.content.trim();
        }
        if (msg.role === 'system') {
            msg.role = 'user';
            msg.content = 'SYSTEM: ' + msg.content;
        }
        if (msg.role === prev_role && msg.role === 'assistant') {
            // insert empty user message to separate assistant messages
            messages.push(filler);
            messages.push(msg);
        }
        else if (msg.role === prev_role) {
            // combine new message with previous message instead of adding a new one
            messages[messages.length-1].content += '\n' + msg.content;
        }
        else {
            messages.push(msg);
        }
        prev_role = msg.role;
        
    }
    if (messages.length > 0 && messages[0].role !== 'user') {
        messages.unshift(filler); // anthropic requires user message to start
    }
    if (messages.length === 0) {
        messages.push(filler);
    }
    return messages;
}