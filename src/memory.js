const fs = require("fs");
const fetch = require("node-fetch");
const { MEMORY_FILE, MAX_GAMES_PER_USER, OLLAMA_URL, OLLAMA_MODEL, MEMORY_SYSTEM_PROMPT } = require("./config");

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
  saveMemory();
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

// New AI Method
async function updateMemoryWithAI(text, userId) {
  // Don't analyze very short texts
  if (text.length < 10) return;

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${MEMORY_SYSTEM_PROMPT}\nTEXT: "${text}"`, 
        stream: false,
        format: "json" // Force JSON mode
      })
    });

    const raw = await res.text();
    const result = JSON.parse(JSON.parse(raw).response); // Ollama returns double-encoded JSON sometimes, or just .response
    
    if (!result) return;

    const user = getUserMemory(userId);
    let changed = false;

    // 1. Update Name
    if (result.name && result.name !== "null") {
      // Prevent Finn from thinking the user is named Finn
      if (!/finn|fynn/i.test(result.name)) {
        user.name = result.name;
        changed = true;
      }
    }

    // 2. Update Games
    if (result.games && Array.isArray(result.games)) {
      user.games = user.games || [];
      result.games.forEach(g => {
        if (!user.games.includes(g)) {
          user.games.unshift(g);
          changed = true;
        }
      });
      user.games = user.games.slice(0, MAX_GAMES_PER_USER);
    }

    // 3. Update Facts
    if (result.facts && Array.isArray(result.facts)) {
      user.facts = user.facts || [];
      result.facts.forEach(f => {
        if (!user.facts.includes(f)) {
          user.facts.push(f);
          changed = true;
        }
      });
    }

    if (changed) {
      console.log(`🧠 [Smart Memory] Updated for ${userId}:`, result);
      user.lastUpdated = Date.now();
      saveMemory();
    }

  } catch (err) {
    console.error("Smart Memory Error:", err.message);
  }
}

module.exports = {
  memory,
  getUserMemory,
  extractKeyMemory,
  updateMemoryWithAI,
  addHistory,
  getHistoryString
};