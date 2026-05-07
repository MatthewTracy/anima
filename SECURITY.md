# Security

## Reporting a vulnerability

If you discover a security issue in Anima, please **do not open a public GitHub issue.**

Email the maintainer directly at the address in the repo's GitHub profile. We aim to acknowledge within 72 hours and provide a fix or mitigation timeline within 7 days.

## Scope

Security-relevant areas of Anima:

1. **API key handling** — Anima reads OpenRouter / Anthropic / OpenAI keys from environment variables (`OPENROUTER_API_KEY` etc.). Never commit `.env`, `.env.local`, or any file containing real keys. The `.gitignore` excludes them by default; please verify your additions don't inadvertently include credentials.

2. **Burden privacy** — the `Burden` primitive deliberately holds *hidden* per-agent state. The `$BURDEN` placeholder substitutes only when the prompt is being built FOR the carrier. If you find a path that allows an agent to read another agent's `bots/<other>/burden.json` via the prompt pipeline, that's a privacy bug — please report it.

3. **LLM-driven file writes** — `core/souls/evolution.js` writes the LLM's output directly to disk. Souls are markdown so this is generally safe, but if you find a case where an LLM response could trigger arbitrary code execution (e.g. via a downstream parser), please report it.

4. **Soul-lock immutability** — once a soul is locked at death, `Soul.save()` should throw. If you find a way to mutate a locked soul's contents through the public API, please report it.

5. **Unsanitized scenario input** — scenarios that accept arbitrary text from agents (`add_to_log`, `writeScripture`, `transmit`) write that text directly to persistent files. Reasonable for trusted LLM agents; if you embed Anima in an untrusted-input pipeline, sanitize accordingly.

## What's NOT in scope

- Bugs in Forum's underlying `mineflayer` integration (report upstream)
- Bugs in Minecraft itself
- API rate-limit issues with OpenRouter or other providers (report to them)
- General LLM hallucination

## Disclosure

We follow a coordinated disclosure model. After a fix is merged, we'll credit reporters in the release notes unless they prefer otherwise.
