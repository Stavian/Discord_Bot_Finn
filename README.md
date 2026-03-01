# Finn Wegbier — Discord Text Bot

A German-language Discord bot with an authentic vagabond (Tippelbruder) personality. Powered by a local Ollama LLM on a remote VM, deployed in a Proxmox LXC container.

## Tech Stack

- **Node.js** + **discord.js v14**
- **Ollama** (remote VM, any local model — default: `llama3.2`)
- **PM2** for process management

## Features

- **Authentic Rotwelsch persona** — Finn Wegbier, a German street philosopher
- **Proactive chatter** — randomly comments on conversations without being addressed (~8% chance)
- **Wake word detection** — responds to "Finn", "Fynn", "@mention"
- **VagaBot integration** — reacts to minigame results (Coinflip, High-Low, Roulette, Duell)
- **User memory** — remembers names, city, games, hobbies across sessions
- **Startup health check** — verifies Ollama connectivity before going online (5 retries)

## Project Structure

```
finn-wegbier/
├── index.js              # Entry point, Discord client, event routing
├── src/
│   ├── config.js         # Config, env vars, system prompt
│   ├── ai.js             # Ollama /api/chat wrapper, retry logic, grammar validation
│   ├── memory.js         # Per-user persistent memory
│   ├── reactions.js      # VagaBot minigame reactions
│   └── chatter.js        # Proactive random chatter engine
├── ecosystem.config.js   # PM2 config
└── .env.example          # Environment variable template
```

## Setup

### 1. Clone & Install

```bash
git clone <repo>
cd finn-wegbier
npm install
cp .env.example .env
```

### 2. Configure `.env`

```env
DISCORD_TOKEN=your_bot_token_here
OLLAMA_URL=http://192.168.x.x:11434   # Your Ollama VM IP
OLLAMA_MODEL=llama3.2
STATUS_CHANNEL_ID=your_channel_id
VAGABOT_ID=vagabot_client_id
```

### 3. Run (Development)

```bash
npm start
```

### 4. Run (Production — PM2)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup   # Auto-start on boot
```

## Proxmox LXC Deployment (Ubuntu 24.04)

```bash
apt update && apt install -y nodejs npm
npm install -g pm2
# clone repo, configure .env, then:
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

Ollama runs on a **separate VM** — just set `OLLAMA_URL` to that VM's IP.

## Tuning Finn's Behavior

| Variable | Default | Description |
|---|---|---|
| `CHATTER_CHANCE` | `0.08` | Probability (0–1) Finn randomly comments |
| `CHATTER_COOLDOWN_MS` | `90000` | Min ms between chatter per channel |
| `REACTION_CHANCE` | `0.6` | Probability Finn reacts to others' VagaBot games |
