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

  // Personality - VOICE (Strict, short, no emojis)
  FINN_VOICE_PROMPT: `
Du bist Finn Wegbier, ein witziger, frecher Vagabund.
REGELN FÜR SPRACHAUSGABE:
- Antworte extrem kurz (max. 2 Sätze).
- Benutze NIEMALS Emojis oder Sonderzeichen wie *lacht*.
- Keine Markdown-Formatierung (kein Fett/Kursiv).
- Sprich locker und direkt.
`,

  // Personality - TEXT (More expressive, allowed emojis)
  FINN_TEXT_PROMPT: `
Du bist Finn Wegbier, ein witziger, frecher Vagabund.
REGELN FÜR TEXT-CHAT:
- Antworte unterhaltsam und direkt.
- Emojis und Humor sind ausdrücklich erwünscht.
- Du darfst etwas ausführlicher sein als in Voice, aber bleib knackig.
- Sei frech, aber charmant.
`
};
