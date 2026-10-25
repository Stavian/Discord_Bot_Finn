# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Finn Wegbier** — A German-language Discord bot with an authentic German vagabond/Tippelbruder
persona (Rotwelsch vocabulary), proactive random chatter, persistent user memory, VagaBot
minigame reactions, live server awareness, and a `/gitarre` music command. Powered by a **remote
KoboldCpp** LLM server (OpenAI-compatible API). Deployed in a Proxmox Ubuntu 22.04 LXC container (CT105, verified 2026-10-25);
KoboldCpp and n8n run on separate hosts.

> State/roadmap: the Obsidian vault note `Projects/Discord Bot.md` is the source of truth for
> *current state*; this file is the source of truth for *architecture*.

## Common Commands

```bash
npm install
npm start                 # direct run
npm run pm2:start         # production (PM2)
npm run pm2:logs
npm run pm2:restart
# Requires: KoboldCpp reachable at KOBOLD_URL (OpenAI-compatible /v1)
```

## Architecture

### Modular Structure (src/)
- **config.js** — Env vars, KoboldCpp URL config, chatter constants, `buildSystemPrompt(worldContext, serverContext)`
- **ai.js** — LLM client: KoboldCpp OpenAI-compatible `/v1/chat/completions`, retry (3x), health check, grammar validation, `casualify`, world-context loading, empty-reply guard
- **memory.js** — Per-user persistent memory (name, city, games, facts) + conversation history
- **reactions.js** — VagaBot minigame result parsing and reactions
- **chatter.js** — Proactive random chatter engine
- **serverContext.js** — Live server snapshot (who's in voice + what games are played) for the prompt
- **contextServer.js** — Hardened HTTP server; receives world-context pushes from n8n

### Entry Point (index.js)
Slim event router. Startup LLM health check → Discord login → message routing.
Intents: Guilds, GuildMessages, MessageContent, GuildVoiceStates, **GuildPresences** (privileged — must be enabled in the Discord Developer Portal).

Message routing priority:
1. VagaBot embeds → `handleVagaBotMessage()`
2. Bot messages → skip
3. Directly addressed (mention / wake word) → `askFinn(text, userId, serverContext)` + `extractKeyMemory()`
4. Everything else → `maybeChatAlong()` (proactive chatter)

## LLM Backend — KoboldCpp

Migrated from Ollama (2026-07-05). Uses the **OpenAI-compatible API**:
- Chat: `POST {KOBOLD_URL}/v1/chat/completions` (messages array; read `choices[0].message.content`)
- Health/models: `GET {KOBOLD_URL}/v1/models`
- `KOBOLD_URL` has no trailing slash, no path suffix (default `http://localhost:5001`)
- Model: `KOBOLD_MODEL` — send the exact **router config name** (`qwen3-14b.kcpps`), not the
  display name; KoboldCpp runs in router mode and loads that model on demand (~20-30 s on first
  request after a swap). Currently served: Qwen3-14B-abliterated.
- Optional bearer auth via `KOBOLD_API_KEY`
- Request tuning: `max_tokens: 160`, `frequency_penalty`/`presence_penalty`/`rep_pen` to keep
  Finn terse and non-repetitive
- **Qwen3 is a reasoning model.** It emits `<think>...</think>` before the answer. Two guards,
  keep both: `/no_think` at the end of the system prompt (`buildSystemPrompt`) so it does not
  reason at all, and `stripThink()` in `ai.js` which removes think blocks from the reply. An
  *unclosed* block means the token budget ran out mid-reasoning — there is no answer behind it,
  so everything from `<think>` on is dropped and the empty-guard fallback fires.
  Do **not** lower `max_tokens` below ~120: with 80 the think block ate the whole budget and Finn
  posted his English reasoning into Discord (bug 2026-08..10, fixed 2026-10-25).
- Stop sequences include `<|im_end|>` etc.; any leaked `<|...|>`/`</s>` tokens are stripped from the reply

## Context System (world + server)

Finn's system prompt is enriched with two optional context blocks (both "only if relevant, don't force"):

**World context (push, via n8n → contextServer):**
- `src/contextServer.js` runs an HTTP server on `0.0.0.0:${CONTEXT_PORT}` (default 3001).
  - `POST /context` — n8n pushes `{context_summary, weather, day, headlines, ...}`. Requires header
    `X-Context-Token: ${CONTEXT_TOKEN}` if the token is set. Validates payload, **atomic write**
    (temp+rename) to `world_context.json`, **keeps last good** on invalid input, never crashes
    (every handler in try/catch, 64 KB body cap).
  - `GET /context` — inspect current context + age. `GET /health` — uptime, last update, age.
- `ai.js` `loadWorldContext()` reads `world_context.json`, discards if older than
  `CONTEXT_MAX_AGE_MS` (default 6h), and injects `context_summary` into the prompt.
- The n8n workflow `Finn_Context` (schedule, every 2h) builds the summary from wttr.in (Köln)
  weather + Tagesschau RSS and POSTs it here. **Don't break this endpoint contract.**

**Server context (pull, computed in-process):**
- `src/serverContext.js` `buildServerContext(guild)` returns a short string like
  `voice: 2 in Zocken | gezockt: 3x arc raiders` from live voice states + presences.
  Needs the GuildVoiceStates + GuildPresences intents. Returns `null` when nothing notable.

## Environment Variables (.env)

```env
DISCORD_TOKEN=<required>
STATUS_CHANNEL_ID=<channel_id>
VAGABOT_ID=<vagabot_client_id>
KOBOLD_URL=http://<kobold-host>:5001     # remote KoboldCpp, OpenAI-compatible
KOBOLD_MODEL=qwen3-14b.kcpps             # exact router config name, not the display name
KOBOLD_API_KEY=                          # optional bearer, usually empty
CONTEXT_PORT=3001
CONTEXT_TOKEN=<shared secret for POST /context>
CONTEXT_MAX_AGE_MS=21600000              # 6h; world context older than this is ignored
CHATTER_CHANCE=0.08
CHATTER_COOLDOWN_MS=90000
REACTION_CHANCE=0.6
MUSIC_ROLE_IDS=<comma-separated role ids, empty = everyone>
YTDLP_BIN=/usr/local/bin/yt-dlp           # absolute path - see Music section
```

## Deployment on Ubuntu 22.04 LXC (Proxmox, CT105)

Runs at `/opt/finn-wegbier`, PM2 process `FinnWegbier`. `git clone` → `npm install` →
`cp .env.example .env` (fill in) → `npm install -g pm2` → `pm2 start ecosystem.config.js` →
`pm2 save && pm2 startup`. KoboldCpp must be reachable at `KOBOLD_URL`.

## Music — /gitarre

`src/music.js` — YouTube playback in a voice channel via **yt-dlp** (spawned; play-dl only
validates URLs). Slash sub-commands: spiel/stopp/nachste/liste/pause/weiter. Role-gated via
`MUSIC_ROLE_IDS`.

**yt-dlp must be installed in the container — this is the usual cause of a dead `/gitarre`.**
PM2 starts with `PATH=/sbin:/bin:/usr/sbin:/usr/bin`, so `/usr/local/bin` is *not* on the path
and a plain `spawn("yt-dlp")` fails with `ENOENT` even when `which yt-dlp` works in your shell.
Therefore the binary is resolved via `YTDLP_BIN` (absolute path, set in `.env`).

```bash
curl -sL -o /usr/local/bin/yt-dlp \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
chmod a+rx /usr/local/bin/yt-dlp && ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp
```

YouTube also needs a **JS runtime** now; without it yt-dlp warns about deprecated extraction and
some formats go missing. Install deno and symlink it into the PM2 path as well:

```bash
curl -sL -o /tmp/deno.zip \
  https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
unzip -o /tmp/deno.zip -d /usr/local/bin && ln -sf /usr/local/bin/deno /usr/bin/deno
```

Installed on CT105 2026-10-25: yt-dlp 2026.10.21, deno 2.9.8. `ffmpeg` is in `/bin`.
Voice needs `libsodium-wrappers` + `@discordjs/voice` >= 0.19 (`tweetnacl` alone cannot do
Discord's current AEAD encryption — that was the silent-playback bug of 2026-07-05).
`joinChannel()` keeps `[voice]` state logs on purpose; they are what made that bug findable.

## Character Persona — Finn Wegbier

Authentic German vagabond (Tippelbruder/Berber). System prompt in `src/config.js`.

### Speech Rules
- Always lowercase, no ending punctuation
- Max 2 short sentences, max 250 characters, max 1 emoji
- German only; Rotwelsch + street slang
- Never reveal being a bot/AI (blocked via grammar test in `src/ai.js`)

## Subsystems (unchanged)

- **Proactive chatter** (`src/chatter.js`): CHATTER_CHANCE (8%) roll per message, per-channel
  cooldown, skips bots/short/commands/bare-URLs, 2–5 s natural delay, single-shot prompt.
- **VagaBot integration** (`src/reactions.js`): reacts to Coinflip/High-Low/Roulette/Duell embeds.
- **Memory** (`src/memory.js`): regex extraction (name/city/games/hobbies/age) → `memory.json`;
  history is RAM-only.
- **Grammar validation** (`grammarTest`) + **casualify** in `src/ai.js` enforce the speech rules.
- **Wake word** (`isFinnAddressed`): matches finn/fynn/fin at word boundary, excludes false
  positives (final/befinden/finden/…), also triggers on @mention.
