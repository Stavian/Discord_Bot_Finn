require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const {
  joinVoiceChannel,
  EndBehaviorType,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");
const prism = require("prism-media");
const path = require("path");
const fs = require("fs");

const {
  DISCORD_TOKEN,
  STATUS_CHANNEL_ID,
  WHISPER_DIR,
  TTS_DIR,
  FILE_CLEANUP_MINUTES
} = require("./src/config");

const {
  writeWavFile,
  cleanupOldFiles
} = require("./src/audio");

const {
  extractKeyMemory,
  updateMemoryWithAI
} = require("./src/memory");

const {
  transcribeWithWhisper,
  askFinn,
  speakWithAI,
  isFinnAddressed
} = require("./src/ai");

// ================= STATE ==================
let activeConnection = null;
const audioPlayer = createAudioPlayer({ behaviors: { noSubscriber: "play" } });

// Track who we are currently recording
const currentlyRecording = new Set(); 

// Queue for AI processing (Transcribe -> LLM -> TTS -> Play)
const processingQueue = [];
let isProcessing = false;
let isSpeaking = false;

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ================= STATUS =================
function sendStatus(text) {
  const ch = client.channels.cache.get(STATUS_CHANNEL_ID);
  if (ch) ch.send(text).catch(() => {});
}

// ================= QUEUE PROCESSOR =================
/**
 * The Queue Processor handles tasks one-by-one.
 * A task contains the path to a recorded WAV file and the userId.
 */
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) return;
  
  isProcessing = true;
  const task = processingQueue.shift();
  const { wavFile, userId } = task;

  try {
    // 1. Transcribe
    console.log(`Transcribing file: ${wavFile}`);
    const text = await transcribeWithWhisper(wavFile);
    console.log(`Transcription result: "${text}"`);
    
    // Clean up recorded file immediately after transcription
    fs.unlink(wavFile, () => {});

    if (!text || !isFinnAddressed(text)) {
      if (text) console.log(`Finn ignored: "${text}" (Not addressed)`);
      isProcessing = false;
      processQueue();
      return;
    }

    // 2. Memory & Thinking
    extractKeyMemory(text, userId);
    updateMemoryWithAI(text, userId); // Smart Memory (Background)
    sendStatus("🤖 Finn denkt nach...");
    const answer = await askFinn(text, userId, "voice");
    console.log(`Finn's answer: "${answer}"`);

    // 3. Synthesis
    const ttsFile = await speakWithAI(answer);
    console.log(`TTS generated: ${ttsFile}`);

    // 4. Wait for Audio Player to be free
    if (isSpeaking) {
      sendStatus("⏳ Finn wartet, bis er ausreden darf...");
      while (isSpeaking) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 5. Play
    isSpeaking = true;
    const resource = createAudioResource(ttsFile, {
      inputType: path.extname(ttsFile) === ".mp3" ? "arbitrary" : "raw"
    });
    audioPlayer.play(resource);

  } catch (err) {
    console.error("Queue Processing Error:", err);
    isProcessing = false;
    processQueue();
  }
}

// ================= AUDIO PLAYER EVENTS =================
audioPlayer.on("stateChange", (oldState, newState) => {
  if (newState.status === AudioPlayerStatus.Idle) {
    isSpeaking = false;
    isProcessing = false; // Task finished
    
    cleanupOldFiles(WHISPER_DIR, FILE_CLEANUP_MINUTES);
    cleanupOldFiles(TTS_DIR, FILE_CLEANUP_MINUTES);
    
    // Check if there is more to do
    processQueue();
  }
});

// ================= RECORDING LOGIC =================
function startRecordingUser(receiver, userId) {
  if (currentlyRecording.has(userId)) return;
  currentlyRecording.add(userId);

  const opusStream = receiver.subscribe(userId, {
    // Increased from 800ms to 1200ms to allow thinking pauses
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 }
  });

  const pcmStream = opusStream.pipe(
    new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 })
  );

  const chunks = [];
  pcmStream.on("data", d => chunks.push(d));

  pcmStream.on("end", async () => {
    currentlyRecording.delete(userId);
    
    const buffer = Buffer.concat(chunks);
    
    // Ignore short noises (< 0.5s approx 48000 bytes)
    // 48000 Hz * 2 bytes/sample * 0.5s = 48000 bytes
    if (buffer.length < 48000) return; 

    const wavFile = path.join(WHISPER_DIR, `speech_${Date.now()}_${userId}.wav`);
    writeWavFile(wavFile, buffer);

    // Add to processing queue
    processingQueue.push({ wavFile, userId });
    processQueue();
  });

  // Security Timeout: Stop recording after 15 seconds no matter what
  setTimeout(() => {
    if (currentlyRecording.has(userId)) {
      opusStream.destroy();
    }
  }, 15000);
}

// ================= LISTENER =================
function setupVoiceListeners(connection) {
  connection.subscribe(audioPlayer);
  const receiver = connection.receiver;

  receiver.speaking.on("start", userId => {
    startRecordingUser(receiver, userId);
  });
}

// ================= BOT COMMANDS =================
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  // 1. Join Voice Command
  if (msg.content.toLowerCase() === "!finn join") {
    const vc = msg.member.voice.channel;
    if (!vc) return;

    activeConnection = joinVoiceChannel({
      channelId: vc.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator
    });

    setupVoiceListeners(activeConnection);
    sendStatus("🍻 Finn Wegbier ist im Sprachchat.");
    return;
  }

  // 2. Text Chat Logic
  // Only reply if the bot is mentioned OR we are in the Status Channel (optional)
  const isMentioned = msg.mentions.has(client.user);
  const isStatusChannel = msg.channel.id === STATUS_CHANNEL_ID;
  
  // You can decide: reply always in status channel, or only when mentioned?
  // Here: Reply if mentioned OR if name is in text (via isFinnAddressed)
  if (isMentioned || isFinnAddressed(msg.content) || (isStatusChannel && !msg.content.startsWith("!"))) {
    
    // Typing indicator
    await msg.channel.sendTyping();

    // Memory & Thinking
    const userId = msg.author.id;
    const text = msg.content.replace(/<@!?[0-9]+>/g, "").trim(); // Remove mentions

    extractKeyMemory(text, userId);
    updateMemoryWithAI(text, userId); // Smart Memory (Background)
    
    try {
      const answer = await askFinn(text, userId, "text");
      msg.reply(answer);
    } catch (err) {
      console.error("Text Chat Error:", err);
      msg.reply("Boah, da ist mir der Geduldsfaden gerissen. Frag nochmal.");
    }
  }
});

// ================= READY =================
client.once(Events.ClientReady, () => {
  sendStatus("🤖 Finn Wegbier ist online.");
  console.log("✅ Finn ist bereit.");
});

client.login(DISCORD_TOKEN);
