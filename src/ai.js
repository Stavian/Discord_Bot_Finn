const fetch = require("node-fetch");
const {
  OLLAMA_URL,
  OLLAMA_MODEL,
  FINN_TEXT_PROMPT
} = require("./config");
const { memory, addHistory, getHistoryString } = require("./memory");

// Grammar test - checks if the model followed the rules
function grammarTest(text) {
  if (!text) return { passed: false, errors: ["empty response"] };

  const errors = [];

  // Test 1: Check for uppercase letters (except in emojis)
  const textWithoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "");
  if (textWithoutEmojis !== textWithoutEmojis.toLowerCase()) {
    errors.push("GROSSBUCHSTABEN gefunden");
  }

  // Test 2: Check for ending punctuation
  if (/[.!?]$/.test(text.trim())) {
    errors.push("satzzeichen am ende");
  }

  // Test 3: Check for too many sentences (more than 2)
  const sentenceCount = (text.match(/[.!?]/g) || []).length;
  if (sentenceCount > 2) {
    errors.push(`zu viele sätze (${sentenceCount})`);
  }

  // Test 4: Check for too many emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojiCount = (text.match(emojiRegex) || []).length;
  if (emojiCount > 1) {
    errors.push(`zu viele emojis (${emojiCount})`);
  }

  // Test 5: Check for overly formal/dramatic phrases and character breaks
  // Vagabund Finn spricht authentisch - keine AI/Bot Phrasen, keine hochgestochene Sprache
  const formalPhrases = [
    /ach du liebesgott/i,
    /oh mein gott/i,
    /ich bedauere/i,
    /es tut mir leid/i,
    /entschuldigung/i,
    /entschuldige/i,
    /ich bin nicht in der lage/i,
    /bitte beachte/i,
    /ich bin eine maschine/i,
    /ich bin ein bot/i,
    /ich bin ki/i,
    /als ki/i,
    /ich kann dir nicht helfen/i,
    /die anfrage/i,
    /keine emotionen/i,
    /ich habe keine gefühle/i,
    /ich bin ein sprachmodell/i,
    /als sprachmodell/i,
    /ich wurde programmiert/i,
    /meine programmierung/i,
    /ich bin ein computerprogramm/i,
    /ich bin software/i,
    /sehr geehrte/i,
    /hochachtungsvoll/i,
    /mit freundlichen grüßen/i
  ];
  for (const phrase of formalPhrases) {
    if (phrase.test(text)) {
      errors.push(`zu formell: "${text.match(phrase)[0]}"`);
    }
  }

  // Test 6: Check response length (too long = over 250 chars for vagabond wisdom)
  if (text.length > 250) {
    errors.push(`zu lang (${text.length} zeichen)`);
  }

  // Test 7: Check for English phrases
  const englishPhrases = [
    /hey there/i,
    /so it seems/i,
    /I am/i,
    /I can/i,
    /you are/i,
    /what do you/i,
    /how are you/i,
    /I think/i,
    /I would/i,
    /I have/i
  ];
  for (const phrase of englishPhrases) {
    if (phrase.test(text)) {
      errors.push(`ENGLISCH gefunden: "${text.match(phrase)[0]}"`);
    }
  }

  const passed = errors.length === 0;

  if (!passed) {
    console.log("--- GRAMMATIK TEST FAILED ---");
    console.log("Errors:", errors.join(", "));
    console.log("Original:", text);
    console.log("-----------------------------");
  } else {
    console.log("--- GRAMMATIK TEST PASSED ---");
  }

  return { passed, errors };
}

// Force casual Discord style on the response
function casualify(text) {
  if (!text) return text;

  // Lowercase everything
  let result = text.toLowerCase();

  // Remove ending punctuation (keep emojis)
  result = result.replace(/[.!?]+$/g, "");

  // Remove multiple punctuation in text
  result = result.replace(/[!?]{2,}/g, "");

  // Limit to first 1-2 sentences (split by . ! ?)
  const sentences = result.split(/(?<=[.!?])\s+/).slice(0, 2);
  result = sentences.join(" ");

  // Remove ending punctuation again after joining
  result = result.replace(/[.!?]+$/g, "");

  // Limit emojis to max 1
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojis = result.match(emojiRegex) || [];
  if (emojis.length > 1) {
    // Keep only the last emoji
    let emojiCount = 0;
    result = result.replace(emojiRegex, (match) => {
      emojiCount++;
      return emojiCount === emojis.length ? match : "";
    });
  }

  // Clean up extra spaces
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

async function askFinn(question, userId) {
  const mem = memory[userId];
  const history = getHistoryString(userId);
  const systemPrompt = FINN_TEXT_PROMPT;

  let userContext = "";
  if (mem?.name) userContext += `Der Nutzer heißt ${mem.name}. `; 
  if (mem?.games?.length) userContext += `Er spielt gerne ${mem.games.join(", ")}. `; 

  const conversationPrompt = `HINTERGRUND: ${userContext}\n\nBISHERIGER VERLAUF:\n${history}\n\nNutzer: ${question}\nFinn:`;

  try {
    console.log("--- PROMPT DEBUG ---");
    console.log("System:", systemPrompt);
    console.log("Conversation:", conversationPrompt);
    console.log("--------------------");

    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt, // Moved instructions here
        prompt: conversationPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          stop: ["Nutzer:", "Finn:"]
        }
      })
    });

    const data = await res.json();
    console.log("--- RAW RESPONSE ---", data);
    const rawAnswer = data.response?.trim() || "";

    // Run grammar test on raw response
    grammarTest(rawAnswer);

    const answer = casualify(rawAnswer);
    console.log("--- CASUALIFIED ---", answer);

    // Update history
    addHistory(userId, "user", question);
    addHistory(userId, "finn", answer);

    return answer;
  } catch (error) {
    console.error("Ollama Error:", error);
    return "ey bruder mein kopf macht grad nicht mit, frag nochmal";
  }
}

function isFinnAddressed(text) {
  const t = text.toLowerCase().trim();
  // Don't filter out "find" here anymore, as it might be a mistranscription of Finn
  if (/(final|befinden)/i.test(t)) return false;

  // Broadened to catch Fynn, Fin, Find, Fine
  const wakeWord = /^(hey\s+)?(f+i+n+d?|f+y+n+)([.,!?\s]|$)/i;
  
  const direct = wakeWord.test(t);
  const command = /(f+i+n+d?|f+y+n+).*(sag|erzähl|erklär|meinst|weißt|hör|hilf)/i.test(t);
  const question = /(f+i+n+d?|f+y+n+).*(kannst|weißt|warum|was|wie|wer|wo)/i.test(t);

  return direct || command || question;
}

module.exports = {
  askFinn,
  isFinnAddressed
};