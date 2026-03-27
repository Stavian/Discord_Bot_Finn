require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");

const { DISCORD_TOKEN, STATUS_CHANNEL_ID, VAGABOT_ID } = require("./src/config");
const { askFinn, isFinnAddressed, checkOllamaHealth } = require("./src/ai");
const { extractKeyMemory } = require("./src/memory");
const { handleVagaBotMessage } = require("./src/reactions");
const { maybeChatAlong } = require("./src/chatter");
const { startContextServer } = require("./src/contextServer");

// ================= CLIENT =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

function sendStatus(text) {
  const ch = client.channels.cache.get(STATUS_CHANNEL_ID);
  if (ch) ch.send(text).catch(() => {});
}

// ================= STARTUP HEALTH CHECK =================

async function waitForOllama(retries = 5, delayMs = 5000) {
  for (let i = 1; i <= retries; i++) {
    console.log(`[health] Ollama check ${i}/${retries}...`);
    const ok = await checkOllamaHealth();
    if (ok) {
      console.log("[health] Ollama erreichbar ✓");
      return true;
    }
    if (i < retries) {
      console.warn(`[health] Ollama nicht erreichbar, warte ${delayMs / 1000}s...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  console.error("[health] Ollama nach allen Versuchen nicht erreichbar. Bot startet trotzdem.");
  return false;
}

// ================= MESSAGE HANDLER =================

client.on("messageCreate", async msg => {
  // Music commands
  if (msg.content.startsWith("!gitarre")) {
    const { handleMusicCommand } = require("./src/music");
    handleMusicCommand(msg).catch(err => console.error("[main] music error:", err));
    return;
  }

  // VagaBot game results
  if (msg.author.id === VAGABOT_ID && msg.embeds.length > 0) {
    await handleVagaBotMessage(msg, client.user.id);
    return;
  }

  // Ignore all other bots
  if (msg.author.bot) return;

  const text = msg.content.replace(/<@!?[0-9]+>/g, "").trim();
  const isMentioned = msg.mentions.has(client.user);
  const isAddressed = isMentioned || isFinnAddressed(msg.content);

  if (isAddressed) {
    // Direct conversation
    await msg.channel.sendTyping();
    extractKeyMemory(text, msg.author.id);

    try {
      const answer = await askFinn(text, msg.author.id);
      await msg.reply(answer);
    } catch (err) {
      console.error("[main] askFinn error:", err);
      await msg.reply("ey bruder da is was schiefgelaufen, frag nochmal");
    }
  } else {
    // Proactive random chatter (background, no await needed)
    maybeChatAlong(msg).catch(err => console.error("[main] chatter error:", err));
  }
});

// ================= READY =================

client.once(Events.ClientReady, async () => {
  console.log(`[discord] eingeloggt als ${client.user.tag}`);

  const ollamaOk = await waitForOllama();
  const statusText = ollamaOk
    ? "🤖 Finn Wegbier ist online und Ollama läuft."
    : "🤖 Finn Wegbier ist online. ⚠️ Ollama nicht erreichbar.";

  sendStatus(statusText);
  startContextServer();
  console.log("[finn] Bereit.");
});

client.login(DISCORD_TOKEN);
