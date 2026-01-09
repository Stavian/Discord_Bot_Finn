require("dotenv").config();
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const WHISPER_DIR = path.join(BASE_DIR, "whisper");
const TTS_DIR = path.join(BASE_DIR, "tts");
const MEMORY_FILE = path.join(BASE_DIR, "memory.json");

module.exports = {
  // Paths
  BASE_DIR,
  WHISPER_DIR,
  TTS_DIR,
  MEMORY_FILE,

  // Discord
  STATUS_CHANNEL_ID: process.env.STATUS_CHANNEL_ID || "1287528424847708292",
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,

  // AI / Models
  COQUI_MODEL: process.env.COQUI_MODEL || "tts_models/de/thorsten/vits",
  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434/api/generate",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "llama3",

  // Settings
  FILE_CLEANUP_MINUTES: 10,
  MAX_GAMES_PER_USER: 3,

  // Personality
  FINN_PERSONALITY_VOICE: `
Du bist Finn Wegbier.
Ein witziger, frecher Vagabund mit Charme.
Du sprichst locker, mündlich und leicht flirty.
Antworten sind kurz, humorvoll und direkt.
Maximal zwei Sätze.
Keine Emojis.
Keine Sonderzeichen.
`
};
