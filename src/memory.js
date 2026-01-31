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
    // Create a copy of memory for saving, excluding conversation history
    const persistentMemory = {};
    for (const [userId, data] of Object.entries(memory)) {
      persistentMemory[userId] = {
        ...data,
        history: [] // Do not save conversation history to disk
      };
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(persistentMemory, null, 2));
  } catch (error) {
    console.error("Error saving memory:", error);
  }
}

function getUserMemory(userId) {
  if (!memory[userId]) {
    memory[userId] = { 
      lastUpdated: Date.now(),
      history: [],
      facts: [] // New: Generic facts list
    };
  }
  if (!memory[userId].history) memory[userId].history = [];
  if (!memory[userId].facts) memory[userId].facts = [];
  return memory[userId];
}

function addHistory(userId, role, content) {
  const user = getUserMemory(userId);
  user.history.push({ role, content, time: Date.now() });
  
  // Keep only last 10 messages
  if (user.history.length > 10) {
    user.history.shift();
  }
  // history is now RAM-only, so we don't save here.
}

function getHistoryString(userId) {
  const user = getUserMemory(userId);
  
  let context = "";
  if (user.facts && user.facts.length > 0) {
    context += "Fakten über den Nutzer:\n- " + user.facts.join("\n- ") + "\n";
  }
  
  const chat = user.history
    .map(h => `${h.role === "user" ? "Nutzer" : "Finn"}: ${h.content}`)
    .join("\n");
    
  return context + "\n" + chat;
}

// Old Regex Method (fast fallback)
function extractKeyMemory(text, userId) {
  const lower = text.toLowerCase();
  const user = getUserMemory(userId);
  let changed = false;

  const nameMatch = lower.match(/(ich heiße|mein name ist)\s+([a-zäöüß]+)/i);
  if (nameMatch) {
    user.name = nameMatch[2];
    changed = true;
  }

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

// AI Memory extraction disabled - was confusing the main AI
async function updateMemoryWithAI(text, userId) {
  // Disabled to prevent AI confusion
  return;
}

module.exports = {
  memory,
  getUserMemory,
  extractKeyMemory,
  updateMemoryWithAI,
  addHistory,
  getHistoryString
};