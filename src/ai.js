const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const {
  OLLAMA_URL,
  OLLAMA_MODEL,
  COQUI_MODEL,
  EDGE_TTS_VOICE,
  WHISPER_DIR,
  TTS_DIR,
  FINN_VOICE_PROMPT,
  FINN_TEXT_PROMPT
} = require("./config");
const { prepareTextForSpeech } = require("./audio");
const { memory, addHistory, getHistoryString } = require("./memory");

// Ensure directories exist
fs.mkdirSync(WHISPER_DIR, { recursive: true });
fs.mkdirSync(TTS_DIR, { recursive: true });

async function speakWithAI(text) {
  const outWav = path.join(TTS_DIR, `speech_${Date.now()}.mp3`); // Edge TTS outputs MP3/Opus usually, but we can name it whatever.
  const safeText = prepareTextForSpeech(text).replace(/"/g, "");

  return new Promise((resolve, reject) => {
    // Using edge-tts via Python module (safer on Windows)
    exec(
      `python -m edge_tts --text "${safeText}" --write-media "${outWav}" --voice ${EDGE_TTS_VOICE}`, 
      (error, stdout, stderr) => {
        if (error) {
          console.error("EdgeTTS Error:", error);
          return reject(error);
        }
        resolve(outWav);
      }
    );
  });
}

// Keep old function for reference if needed, or remove it. 
// For now, I'm replacing the old Coqui one completely.

function transcribeWithWhisper(wavFile) {
  return new Promise(resolve => {
    exec(
      `python -m whisper "${wavFile}" --model base --language German --fp16 False --output_format txt --output_dir "${WHISPER_DIR}"`, 
      (error, stdout, stderr) => {
        if (error) {
          console.error("Whisper Exec Error:", error);
          console.error("Whisper Stderr:", stderr);
        }
        const txtPath = wavFile.replace(".wav", ".txt");
        if (!fs.existsSync(txtPath)) {
          console.log("Whisper output file not found:", txtPath);
          return resolve(null);
        }
        let text = fs.readFileSync(txtPath, "utf8").trim();
        
        // Filter common Whisper hallucinations (silence processing artifacts)
        const hallucinations = [
          "Hey there, hows it going", 
          "Im feeling quite peppy", 
          "Thank you for watching", 
          "Subtitles by",
          "Amara.org"
        ];
        
        if (hallucinations.some(h => text.includes(h))) {
          console.log("Ignored Whisper hallucination:", text);
          return resolve(null);
        }

        resolve(text);
      }
    );
  });
}

async function askFinn(question, userId, mode = "voice") {
  const mem = memory[userId];
  const history = getHistoryString(userId);
  const systemPrompt = mode === "text" ? FINN_TEXT_PROMPT : FINN_VOICE_PROMPT;

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
    const answer = data.response?.trim() || "";

    // Update history
    addHistory(userId, "user", question);
    addHistory(userId, "finn", answer);

    return answer;
  } catch (error) {
    console.error("Ollama Error:", error);
    return "Äh, mein Gehirn hat gerade einen Aussetzer.";
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
  speakWithAI,
  transcribeWithWhisper,
  askFinn,
  isFinnAddressed
};