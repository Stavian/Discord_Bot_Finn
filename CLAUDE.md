# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Finn Wegbier** - A German-language Discord text-only bot powered by remote Ollama LLM. Features an authentic German vagabond/Tippelbruder persona with Rotwelsch vocabulary, proactive random chatter, persistent user memory, and VagaBot minigame reactions. Deployed in a Proxmox Ubuntu 24.04 LXC container; Ollama runs on a separate VM.

## Common Commands

```bash
# Install dependencies
npm install

# Development (direct run)
npm start

# Production (PM2)
npm run pm2:start
npm run pm2:logs
npm run pm2:status
npm run pm2:restart
npm run pm2:stop

# Required: Ollama running on remote VM at OLLAMA_URL
```

## Architecture

### Modular Structure (src/)
- **config.js** - Env vars, Ollama URL config, chatter constants, system prompt with injected examples
- **ai.js** - Ollama `/api/chat` wrapper, retry logic (3x), health check, grammar validation, casualify
- **memory.js** - Per-user persistent memory (name, city, games, facts), conversation history for `/api/chat`
- **reactions.js** - VagaBot minigame result parsing and reactions
- **chatter.js** - Proactive random chatter engine (CHATTER_CHANCE, per-channel cooldown)

### Entry Point (index.js)
Slim event router. Startup Ollama health check → Discord login → message routing.

Message routing priority:
1. VagaBot embeds → `handleVagaBotMessage()`
2. Bot messages → skip
3. Directly addressed (mention / wake word) → `askFinn()` + `extractKeyMemory()`
4. Everything else → `maybeChatAlong()` (proactive chatter, 8% chance, 90s cooldown)

## Deployment on Ubuntu 24.04 LXC (Proxmox)

```bash
# In the CT:
git clone <repo>
cd finn-wegbier
npm install
cp .env.example .env
# Edit .env — set DISCORD_TOKEN and OLLAMA_URL=http://<ollama-vm-ip>:11434
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

## Environment Variables (.env)

```env
DISCORD_TOKEN=<required>
STATUS_CHANNEL_ID=<channel_id>
VAGABOT_ID=<vagabot_client_id>
OLLAMA_URL=http://192.168.x.x:11434   # Remote Ollama VM IP
OLLAMA_MODEL=llama3.2
CHATTER_CHANCE=0.08
CHATTER_COOLDOWN_MS=90000
REACTION_CHANCE=0.6
```

## Ollama API

Uses `/api/chat` endpoint (message array format), NOT `/api/generate`.
Health check uses `/api/tags`.
Base URL set via `OLLAMA_URL` env — no trailing slash, no path suffix.

## Character Persona — Finn Wegbier

Authentic German vagabond (Tippelbruder/Berber). See system prompt in `src/config.js`.

### Speech Rules
- Always lowercase, no ending punctuation
- Max 2 short sentences, max 250 characters, max 1 emoji
- German only
- Uses Rotwelsch vocabulary mixed with street slang
- Blocks AI/bot-reveal phrases via grammar test in `src/ai.js`

## Proactive Chatter System

`src/chatter.js` makes Finn feel like a real Discord member:
- **CHATTER_CHANCE** (default 8%): random roll per incoming message
- **CHATTER_COOLDOWN_MS** (default 90s): minimum time between chatter per channel
- Skips: bots, short messages (<5 chars), commands (! / .), bare URLs
- 2–5 second natural delay before sending
- Uses lightweight single-shot prompt (no conversation history)

## VagaBot Integration

`src/reactions.js` watches for VagaBot embed messages.
- **60% chance** to react to other players' games
- **Always reacts** when Finn himself was in the game
- Detects: Coinflip, High-Low, Roulette, Duell
- Separate message pools for: own win/loss/tie, others win/loss, big amounts (>500)

## Memory System

`src/memory.js` — persisted to `memory.json` (history is RAM-only).
Regex extraction: name, city, games, hobbies, age.
History format: messages array compatible with `/api/chat`.

## Grammar Validation

`grammarTest()` in `src/ai.js`:
1. No uppercase letters
2. No ending punctuation
3. Max 2 sentences
4. Max 1 emoji
5. No formal/bot-reveal phrases
6. Max 250 characters
7. No English phrases

`casualify()` post-processes responses to enforce these rules.

## Wake Word Detection

`isFinnAddressed()` in `src/ai.js`:
- Matches "finn", "fynn", "fin" at word boundary
- Excludes false positives: "final", "befinden", "finden", "findest", "finalist"
- Also triggers on `@mention`
