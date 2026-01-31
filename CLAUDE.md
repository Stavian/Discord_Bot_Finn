# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Finn Wegbier** - A German-language Discord voice AI bot with local AI stack (Ollama LLM + Whisper STT). Features persistent user memory, dual persona modes (voice vs text), and real-time voice conversation capabilities.

## Common Commands

```bash
# Install dependencies
npm install

# Development (direct run)
npm start
# or
node index.js

# Production (PM2 process manager)
npm run pm2:start      # Start bot
npm run pm2:logs       # View logs
npm run pm2:status     # Check status
npm run pm2:restart    # Restart bot
npm run pm2:stop       # Stop bot

# Required external dependencies (must be installed separately):
# - Python 3.x with modules: whisper, edge_tts
# - Ollama running locally on http://localhost:11434
# - FFmpeg in system PATH
```

## PM2 Configuration (ecosystem.config.js)

**Production Settings:**
- Memory limit: 500MB (auto-restart if exceeded)
- Max 10 restarts within 10 seconds
- 4-second restart delay
- Logs to `logs/error.log` and `logs/out.log`

## Architecture

### Modular Structure (src/)
- **config.js** - Central configuration, personality prompts, constants
- **ai.js** - Wrappers for Whisper (STT), Ollama (LLM), Edge TTS (speech synthesis)
- **audio.js** - WAV file handling, cleanup scheduling, audio processing
- **memory.js** - Dual-tier memory system (regex + AI), JSON persistence

### Entry Point (index.js)
Main Discord client event loop that coordinates all systems. Not modularized further to keep event handling centralized.

**Key Features:**
- Voice channel recording and response
- Text message handling with wake word detection
- VagaBot minigame reaction system (watches for game results and comments)

### Dual-Mode Persona System
The bot has two distinct personalities controlled by different system prompts:

- **Voice Mode** (FINN_VOICE_PROMPT): Ultra-short responses (1-2 sentences), no emojis, no markdown, TTS-optimized
- **Text Mode** (FINN_TEXT_PROMPT): Expressive, uses emojis (🍻, 🏕️, 🚂, 🚬, 🌭), markdown allowed

Mode selection happens automatically based on interaction type (voice channel vs text message).

### Memory Architecture

**Two-Tier Extraction:**
1. **Fast Tier** (regex): Instant extraction of names and games using pattern matching
2. **Smart Tier** (AI): Background LLM analysis for complex facts (hobbies, location, profession)

**Persistence Strategy:**
- User data saved to `memory.json` (names, games, facts)
- Conversation history (last 10 messages) kept in RAM only - cleared on restart
- Memory updates happen asynchronously to avoid blocking responses

**Access Pattern:**
```javascript
// Always use getQueue-style pattern
const userMemory = memory[userId] || { name: null, games: [], facts: [], messages: [] };
```

### Queue-Based Voice Processing

Voice tasks are serialized to prevent freezing when multiple users speak simultaneously:

```javascript
const processingQueue = [];
let isProcessing = false;

// Tasks flow: Record → Transcribe → Update Memory → Query LLM → Synthesize → Play
```

**Critical State Variables:**
- `activeConnection` - Current voice channel connection
- `currentlyRecording` - Set of user IDs being recorded
- `processingQueue` - Pending voice tasks
- `isProcessing` - Processing lock
- `isSpeaking` - Audio player lock

### Audio Pipeline

```
Discord Opus Stream
    ↓ (subscribe & decode with prism-media)
PCM Stream (48kHz mono)
    ↓ (write WAV file with custom header)
Whisper Python Module
    ↓ (German transcription)
Ollama LLM
    ↓ (German response)
Edge TTS Python Module
    ↓ (MP3/Opus audio)
Discord Audio Player
```

### Voice Activity Detection

- **Silence threshold**: 1200ms (configurable in index.js)
- **Maximum recording**: 15 seconds (security timeout)
- **Noise filtering**: Discards recordings < 0.5 seconds
- **Hallucination filtering**: Rejects common Whisper false transcriptions

### Wake Word Detection

Bot responds to text messages when:
1. Mentioned directly (@Finn)
2. Name appears in message ("Finn", "Fynn", "Fin", "Find")
3. In designated status channel

**Regex patterns filter false positives** (e.g., "befinden", "final" don't trigger).

## Key Implementation Details

### Python Integration
All Python scripts are called via child_process spawn, not exec:
```javascript
const whisper = spawn('python', ['-m', 'whisper', ...]);
const tts = spawn('edge-tts', ['--text', text, ...]);
```

### File Cleanup
Automatic cleanup runs after each audio playback (10-minute threshold):
- Deletes old files from `whisper/` and `tts/` directories
- Triggered by `AudioPlayerStatus.Idle` event
- Prevents storage bloat from continuous operation

### Conversation Context
LLM receives:
- Last 10 messages from RAM (session-only)
- User's name and favorite games (persistent)
- Extracted facts about the user (persistent)
- Appropriate system prompt (voice/text mode)

### Error Handling
No global error logger to Discord. Errors are logged to console only. The bot should continue running even if individual voice processing tasks fail.

## VagaBot Integration

Finn watches for minigame results from VagaBot and reacts with his personality.

### Supported Games
- **Coinflip** - Coin flip gambling
- **High-Low** - Number guessing game
- **Roulette** - Russian roulette style game
- **Duels** - PvP gambling matches

### Detection Logic (parseGameResult)
Analyzes VagaBot embeds for:
- **Win indicators**: Title contains "gewonnen", "ausgezahlt", "perfekt", description contains "überlebt"
- **Loss indicators**: Title contains "verloren", "peng", "💔"

### Reaction Behavior
- **60% chance** to react (prevents spam, configurable via `REACTION_CHANCE`)
- **1-3 second delay** before responding (natural timing)
- **Big amounts (>500 coins)** trigger special dramatic reactions
- Uses text-mode personality (emojis enabled)

### Reaction Examples
**Wins:**
- "Oha, da hat aber einer Glück gehabt! 🍻 Gib mal einen aus, Kollege!"
- "Na, da hat wohl einer den richtigen Riecher! Prost darauf! 🍺"

**Losses:**
- "Autsch, Kollege... Das tat sogar mir weh! 😬"
- "Pech gehabt, Meister! Aber hey, wenigstens warst du mutig! 💪"

## Environment Variables

```env
DISCORD_TOKEN=<bot_token>              # Required
STATUS_CHANNEL_ID=<channel_id>         # Optional (for text responses)
OLLAMA_MODEL=dolphin-llama3            # Optional (default: dolphin-llama3)
VAGABOT_ID=<vagabot_client_id>         # Optional (for minigame reactions)
```

## Config Constants (src/config.js)

```javascript
REACTION_CHANCE: 0.6    // 60% chance to react to VagaBot game results
```

## German Language Requirements

All user-facing text must be in German:
- Voice responses from LLM (enforced by system prompt)
- Status messages in Discord channels
- Character personality (street vagrant, German slang)

## Character Persona

**Name:** Finn Wegbier (vagrant/hobo character)
**Vocabulary:** Uses German slang like "Meister", "Kollege", "Pass auf", "Auf Achse"
**Tone:** Rough, direct, street-smart but good-hearted
**Voice Settings:** Raw and practical
**Text Settings:** Playful with emojis when appropriate
