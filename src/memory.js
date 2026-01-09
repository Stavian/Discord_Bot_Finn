const fs = require("fs");
const { MEMORY_FILE, MAX_GAMES_PER_USER } = require("./config");

let memory = {};

// Initialize memory
if (fs.existsSync(MEMORY_FILE)) {
  try {
    memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch (error) {
    console.error("Error reading memory file:", error);
    memory = {};
  }
}

function saveMemory() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error("Error saving memory:", error);
  }
}

function getUserMemory(userId) {
  if (!memory[userId]) {
    memory[userId] = { 
      lastUpdated: Date.now(),
      history: [] // Added conversation history
    };
  }
  if (!memory[userId].history) memory[userId].history = [];
  return memory[userId];
}

function addHistory(userId, role, content) {
  const user = getUserMemory(userId);
  user.history.push({ role, content, time: Date.now() });
  
  // Keep only last 10 messages
  if (user.history.length > 10) {
    user.history.shift();
  }
  saveMemory();
}

function getHistoryString(userId) {
  const user = getUserMemory(userId);
  return user.history
    .map(h => `${h.role === "user" ? "Nutzer" : "Finn"}: ${h.content}`)
    .join("\n");
}

function extractKeyMemory(text, userId) {
  const lower = text.toLowerCase();
  const user = getUserMemory(userId);
  let changed = false;

  // Name extraction
  const nameMatch = lower.match(/(ich heiße|mein name ist)\s+([a-zäöüß]+)/i);
  if (nameMatch) {
    user.name = nameMatch[2];
    changed = true;
  }

  // Game extraction
  const gameMatch = lower.match(/(lieblingsspiel ist|spiele gerne)\s+([a-z0-9 ]+)/i);
  if (gameMatch) {
    user.games = user.games || [];
    const game = gameMatch[2].trim();
    if (!user.games.includes(game)) {
      user.games.unshift(game);
      user.games = user.games.slice(0, MAX_GAMES_PER_USER);
      changed = true;
    }
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
  getHistoryString
};
