const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const {
  OLLAMA_CHAT_URL,
  OLLAMA_HEALTH_URL,
  OLLAMA_MODEL,
  BASE_DIR,
  buildSystemPrompt
} = require("./config");
const { getHistoryForChat, addHistory } = require("./memory");

const CONTEXT_FILE = path.join(BASE_DIR, "world_context.json");
const CONTEXT_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadWorldContext() {
  try {
    const raw = fs.readFileSync(CONTEXT_FILE, "utf8");
    const ctx = JSON.parse(raw);
    const age = Date.now() - new Date(ctx.timestamp).getTime();
    if (age > CONTEXT_MAX_AGE_MS) return null;
    return ctx;
  } catch {
    return null;
  }
}

// ================= HEALTH CHECK =================

async function checkOllamaHealth() {
  try {
    const res = await fetch(OLLAMA_HEALTH_URL, { method: "GET", timeout: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}

// ================= GRAMMAR VALIDATION =================

function grammarTest(text) {
  if (!text) return { passed: false, errors: ["empty response"] };

  const errors = [];
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

  const textWithoutEmojis = text.replace(emojiRegex, "");
  if (textWithoutEmojis !== textWithoutEmojis.toLowerCase()) {
    errors.push("GROSSBUCHSTABEN");
  }

  if (/[.!?]$/.test(text.trim())) {
    errors.push("satzzeichen am ende");
  }

  const sentenceCount = (text.match(/[.!?]/g) || []).length;
  if (sentenceCount > 2) {
    errors.push(`zu viele sätze (${sentenceCount})`);
  }

  const emojiCount = (text.match(emojiRegex) || []).length;
  if (emojiCount > 1) {
    errors.push(`zu viele emojis (${emojiCount})`);
  }

  if (text.length > 250) {
    errors.push(`zu lang (${text.length} zeichen)`);
  }

  const blockedPhrases = [
    /ich bin ein bot/i, /ich bin ki/i, /als ki/i,
    /ich bin ein sprachmodell/i, /als sprachmodell/i,
    /ich wurde programmiert/i, /ich bin software/i,
    /ich bedauere/i, /es tut mir leid/i, /entschuldigung/i,
    /sehr geehrte/i, /mit freundlichen grüßen/i,
    /hey there/i, /I am /i, /I can /i, /you are/i
  ];
  for (const phrase of blockedPhrases) {
    if (phrase.test(text)) {
      errors.push(`verbotene phrase: "${text.match(phrase)[0]}"`);
    }
  }

  const passed = errors.length === 0;
  if (!passed) {
    console.log("[grammar] FAILED:", errors.join(", "), "| text:", text);
  }
  return { passed, errors };
}

// ================= CASUALIFY =================

function casualify(text) {
  if (!text) return text;

  let result = text.toLowerCase();
  result = result.replace(/[.!?]+$/g, "");
  result = result.replace(/[!?]{2,}/g, "");

  // Limit to first 2 sentences
  const sentences = result.split(/(?<=[.!?])\s+/).slice(0, 2);
  result = sentences.join(" ").replace(/[.!?]+$/g, "");

  // Keep only last emoji if multiple
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojis = result.match(emojiRegex) || [];
  if (emojis.length > 1) {
    let count = 0;
    result = result.replace(emojiRegex, m => (++count === emojis.length ? m : ""));
  }

  // Enforce 250 char limit
  if (result.length > 250) {
    result = result.slice(0, 247) + "...";
  }

  return result.replace(/\s+/g, " ").trim();
}

// ================= OLLAMA CALL WITH RETRY =================

async function callOllama(messages, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
          options: {
            temperature: 0.75,
            stop: ["Nutzer:", "User:"]
          }
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      return data.message?.content?.trim() || "";
    } catch (err) {
      console.error(`[ollama] attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return null;
}

// ================= ASK FINN =================

async function askFinn(question, userId) {
  const history = getHistoryForChat(userId);
  const worldContext = loadWorldContext();

  // Build messages: system + history + new user message
  const messages = [
    { role: "system", content: buildSystemPrompt(worldContext) },
    ...history,
    { role: "user", content: question }
  ];

  const raw = await callOllama(messages);

  if (!raw) {
    return "ey bruder mein kopf macht grad nicht mit, frag nochmal";
  }

  grammarTest(raw);
  const answer = casualify(raw);
  console.log("[finn]", answer);

  addHistory(userId, "user", question);
  addHistory(userId, "assistant", answer);

  return answer;
}

// ================= WAKE WORD =================

function isFinnAddressed(text) {
  const t = text.toLowerCase().trim();
  if (/(final|befinden|finden|findest|finalist)/i.test(t)) return false;

  // Match "finn", "fynn", "fin" at word boundary, optionally with "hey" prefix
  const wakeWord = /(?:^|\s)(?:hey\s+)?f[iy]nn?([.,!?\s]|$)/i;
  return wakeWord.test(t);
}

module.exports = {
  askFinn,
  isFinnAddressed,
  checkOllamaHealth,
  casualify,
  callOllama
};
