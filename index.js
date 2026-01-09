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
  extractKeyMemory
} = require("./src/memory");

const {
  transcribeWithWhisper,
  askFinn,
  speakWithCoqui,
  isFinnAddressed
} = require("./src/ai");

// ================= STATE ==================
let activeConnection = null;
let speakerQueue = [];
let activeSpeaker = null;

let speechCaptureActive = false;
let commandLock = false;
let audioBusy = false;

// 🔒 Lock per User
const userCaptureLock = new Set();

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ================= AUDIO PLAYER =================
const audioPlayer = createAudioPlayer({ behaviors: { noSubscriber: "play" } });

audioPlayer.on("stateChange", (oldState, newState) => {
  if (
    oldState.status === AudioPlayerStatus.Playing &&
    newState.status === AudioPlayerStatus.Idle
  ) {
    audioBusy = false;
    commandLock = false;
    speechCaptureActive = false;

    if (activeSpeaker) {
      userCaptureLock.delete(activeSpeaker);
      activeSpeaker = null;
    }

    cleanupOldFiles(WHISPER_DIR, FILE_CLEANUP_MINUTES);
    cleanupOldFiles(TTS_DIR, FILE_CLEANUP_MINUTES);

    sendStatus("😏 Finn hat geantwortet.");

    if (activeConnection) {
      processNextSpeaker(activeConnection.receiver);
    }
  }
});

function sendStatus(text) {
  const ch = client.channels.cache.get(STATUS_CHANNEL_ID);
  if (ch) ch.send(text).catch(() => {});
}

// ================= LOGIC =================
function processNextSpeaker(receiver) {
  if (speechCaptureActive || audioBusy || commandLock) return;
  if (speakerQueue.length === 0) return;

  const userId = speakerQueue.shift();
  userCaptureLock.add(userId);
  activeSpeaker = userId;
  speechCaptureActive = true;

  const opusStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 700 }
  });

  const pcmStream = opusStream.pipe(
    new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 })
  );

  const chunks = [];
  pcmStream.on("data", d => chunks.push(d));

  pcmStream.on("end", async () => {
    speechCaptureActive = false;

    const buffer = Buffer.concat(chunks);
    if (buffer.length < 18000) { // Ignore short noises
      userCaptureLock.delete(userId);
      processNextSpeaker(receiver);
      return;
    }

    const wavFile = path.join(WHISPER_DIR, `speech_${Date.now()}_${userId}.wav`);
    writeWavFile(wavFile, buffer);

    try {
      const text = await transcribeWithWhisper(wavFile);
      
      if (!text || !isFinnAddressed(text)) {
        userCaptureLock.delete(userId);
        fs.unlink(wavFile, () => {});
        processNextSpeaker(receiver);
        return;
      }

      extractKeyMemory(text, userId);

      commandLock = true;
      audioBusy = true;
      sendStatus("🤖 Finn denkt nach…");

      const answer = await askFinn(text, userId);
      const tts = await speakWithCoqui(answer);
      audioPlayer.play(createAudioResource(tts));

    } catch (err) {
      console.error("Processing Error:", err);
      userCaptureLock.delete(userId);
      commandLock = false;
      audioBusy = false;
      processNextSpeaker(receiver);
    }
  });
}

function listenForSpeech(connection) {
  connection.subscribe(audioPlayer);
  const receiver = connection.receiver;

  receiver.speaking.on("start", userId => {
    if (userCaptureLock.has(userId)) return;
    if (speakerQueue.includes(userId)) return;

    speakerQueue.push(userId);
    processNextSpeaker(receiver);
  });
}

// ================= COMMANDS =================
client.on("messageCreate", msg => {
  if (msg.author.bot) return;

  if (msg.content.toLowerCase() === "!finn join") {
    const vc = msg.member.voice.channel;
    if (!vc) return;

    activeConnection = joinVoiceChannel({
      channelId: vc.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator
    });

    listenForSpeech(activeConnection);
    sendStatus("🍻 Finn Wegbier ist im Sprachchat.");
  }
});

// ================= START =================
client.once(Events.ClientReady, () => {
  sendStatus("🤖 Finn Wegbier ist online.");
  console.log("✅ Finn ist bereit.");
});

client.login(DISCORD_TOKEN);