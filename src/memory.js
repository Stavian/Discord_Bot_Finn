const fs = require("fs");
const { MEMORY_FILE, MAX_GAMES_PER_USER } = require("./config");

let memory = {};

// Load persisted memory on startup
if (fs.existsSync(MEMORY_FILE)) {
  try {
    memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch (err) {
    console.error("[memory] load error:", err);
    memory = {};
  }
}

function saveMemory() {
  try {
    const persistent = {};
    for (const [uid, data] of Object.entries(memory)) {
      persistent[uid] = { ...data, history: [] }; // history stays in RAM only
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(persistent, null, 2));
  } catch (err) {
    console.error("[memory] save error:", err);
  }
}

function getUserMemory(userId) {
  if (!memory[userId]) {
    memory[userId] = { history: [], facts: [] };
  }
  if (!memory[userId].history) memory[userId].history = [];
  if (!memory[userId].facts) memory[userId].facts = [];
  return memory[userId];
}

// ================= HISTORY =================

function addHistory(userId, role, content) {
  const user = getUserMemory(userId);
  user.history.push({ role, content });
  if (user.history.length > 12) user.history.shift(); // keep last 12 turns
}

// Returns messages array for /api/chat (excludes system prompt — that's in ai.js)
function getHistoryForChat(userId) {
  const user = getUserMemory(userId);

  // Prepend a brief user-context line as first user turn if we know facts
  const contextLines = [];
  if (user.name) contextLines.push(`der nutzer heißt ${user.name}`);
  if (user.city) contextLines.push(`kommt aus ${user.city}`);
  if (user.games?.length) contextLines.push(`spielt gerne ${user.games.join(", ")}`);
  if (user.facts?.length) contextLines.push(...user.facts.slice(0, 3));

  const messages = [];

  if (contextLines.length) {
    messages.push({
      role: "user",
      content: `[kontext: ${contextLines.join(", ")}]`
    });
    messages.push({
      role: "assistant",
      content: "jo, kenn ich"
    });
  }

  // Append actual conversation history
  for (const h of user.history) {
    messages.push({ role: h.role, content: h.content });
  }

  return messages;
}

// ================= REGEX MEMORY EXTRACTION =================

function extractKeyMemory(text, userId) {
  const lower = text.toLowerCase();
  const user = getUserMemory(userId);
  let changed = false;

  // Name
  const nameMatch = lower.match(/(?:ich heiße|mein name ist|ich bin der|ich bin die|nennt mich|call me)\s+([a-zäöüß]{2,20})/i);
  if (nameMatch) {
    user.name = nameMatch[1];
    changed = true;
  }

  // City / origin
  const cityMatch = lower.match(/(?:ich komme aus|ich bin aus|lebe in|wohne in)\s+([a-zäöüß]{2,25})/i);
  if (cityMatch) {
    user.city = cityMatch[1];
    changed = true;
  }

  // Games
  const gameMatch = lower.match(/(?:lieblingsspiel ist|spiele gerne|zocke gerne|spiele hauptsächlich)\s+([a-z0-9 äöü]{2,30})/i);
  if (gameMatch) {
    user.games = user.games || [];
    const game = gameMatch[1].trim();
    if (!user.games.includes(game)) {
      user.games.unshift(game);
      user.games = user.games.slice(0, MAX_GAMES_PER_USER);
      changed = true;
    }
  }

  // Generic facts (hobby, age)
  const hobbyMatch = lower.match(/(?:ich mag|ich liebe|mein hobby ist|mache gerne)\s+([a-z0-9äöü ]{3,30})/i);
  if (hobbyMatch) {
    const fact = `mag ${hobbyMatch[1].trim()}`;
    if (!user.facts.includes(fact)) {
      user.facts.unshift(fact);
      user.facts = user.facts.slice(0, 5);
      changed = true;
    }
  }

  const ageMatch = lower.match(/(?:ich bin|ich werde)\s+(\d{1,2})\s+jahre/i);
  if (ageMatch) {
    const fact = `ist ${ageMatch[1]} jahre alt`;
    user.facts = user.facts.filter(f => !f.startsWith("ist ") || !f.includes("jahre"));
    user.facts.unshift(fact);
    user.facts = user.facts.slice(0, 5);
    changed = true;
  }

  if (changed) {
    user.lastUpdated = Date.now();
    saveMemory();
  }
}

module.exports = {
  memory,
  getUserMemory,
  extractKeyMemory,
  addHistory,
  getHistoryForChat
};
