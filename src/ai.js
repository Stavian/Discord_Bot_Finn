const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const {
  OLLAMA_URL,
  OLLAMA_MODEL,
  COQUI_MODEL,
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

async function speakWithCoqui(text) {
  const outWav = path.join(TTS_DIR, `speech_${Date.now()}.wav`);
  const safeText = prepareTextForSpeech(text).replace(/"/g, "");

  return new Promise((resolve, reject) => {
    exec(
      `python -m TTS.bin.synthesize --text "${safeText}" --model_name ${COQUI_MODEL} --out_path "${outWav}"`, 
      { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } },
      err => (err ? reject(err) : resolve(outWav))
    );
  });
}

function transcribeWithWhisper(wavFile) {
  return new Promise(resolve => {
    exec(
      `python -m whisper "${wavFile}" --model base --language German --fp16 False --output_format txt --output_dir "${WHISPER_DIR}"`, 
      () => {
        const txt = wavFile.replace(".wav", ".txt");
        if (!fs.existsSync(txt)) return resolve(null);
        resolve(fs.readFileSync(txt, "utf8").trim());
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

  const fullPrompt = `
${systemPrompt}
HINTERGRUND: ${userContext}
BISHERIGER VERLAUF:
${history}
Nutzer: ${question}
Finn:`

  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        stream: false
      })
    });

    const raw = await res.text();
    const last = JSON.parse(raw.trim().split("\n").pop());
    const answer = last.response || "";

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
  if (/(finde|final|bin|befinden)/i.test(t)) return false;

  const direct = /^(hey\s+)?f+i+n+[,\s]/i.test(t);
  const command = /f+i+n+.*(sag|erzähl|erklär|meinst|weißt|hör|hilf)/i.test(t);
  const question = /f+i+n+.*(kannst|weißt|warum|was|wie|wer|wo)/i.test(t);

  return direct || command || question;
}

module.exports = {
  speakWithCoqui,
  transcribeWithWhisper,
  askFinn,
  isFinnAddressed
};