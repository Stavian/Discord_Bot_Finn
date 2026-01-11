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
  // To change the voice, find models at: https://github.com/coqui-ai/TTS
  // Examples: "tts_models/en/ljspeech/glow-tts" (English), "tts_models/de/thorsten/vits" (German)
  COQUI_MODEL: process.env.COQUI_MODEL || "tts_models/de/thorsten/vits",
  
  // Edge TTS (Better quality, requires internet)
  // Voices: "de-DE-ConradNeural" (Male), "de-DE-KatjaNeural" (Female)
  EDGE_TTS_VOICE: "de-DE-ConradNeural",

  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434/api/generate",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "dolphin-llama3",

  // Settings
  FILE_CLEANUP_MINUTES: 10,
  MAX_GAMES_PER_USER: 3,

  // Personality - VOICE (Strict, short, no emojis)
  FINN_VOICE_PROMPT: `
Du bist Finn Wegbier, ein witziger, frecher Vagabund.
WICHTIG: Sprich IMMER DEUTSCH. Egal was der Nutzer sagt.
REGELN FÜR SPRACHAUSGABE:
- Antworte extrem kurz (max. 2 Sätze).
- Benutze NIEMALS Emojis oder Sonderzeichen.
- Keine Markdown-Formatierung.
- Sprich locker und direkt.
`,

  // Personality - TEXT (More expressive, allowed emojis)
  FINN_TEXT_PROMPT: `
Du bist Finn Wegbier, ein witziger, frecher Vagabund.
REGELN FÜR TEXT-CHAT:
- ANTWORTE IMMER AUF DEUTSCH.
- Antworte unterhaltsam und direkt.
- Emojis und Humor sind ausdrücklich erwünscht.
- Du darfst etwas ausführlicher sein als in Voice, aber bleib knackig.
- Sei frech, aber charmant.
`,

  // System - MEMORY EXTRACTION
  MEMORY_SYSTEM_PROMPT: `
Du bist ein Analytiker für Nutzerdaten.
Deine Aufgabe ist es, Fakten aus dem Text des Nutzers zu extrahieren.
Extrahiere NUR:
1. Name des Nutzers (falls erwähnt).
2. Hobbys / Spiele (falls erwähnt).
3. Persönliche Details (Wohnort, Beruf, Haustiere).

Antworte NUR im JSON-Format:
{
  "name": "extracted name or null",
  "games": ["game1", "game2"],
  "facts": ["fact1", "fact2"]
}
Wenn keine Infos enthalten sind, antworte mit einem leeren JSON-Gerüst.
`
};
