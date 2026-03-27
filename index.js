require("dotenv").config();
const { Client, GatewayIntentBits, Events, REST, Routes } = require("discord.js");

const { DISCORD_TOKEN, STATUS_CHANNEL_ID, VAGABOT_ID } = require("./src/config");
const { askFinn, isFinnAddressed, checkOllamaHealth } = require("./src/ai");
const { extractKeyMemory } = require("./src/memory");
const { handleVagaBotMessage } = require("./src/reactions");
const { maybeChatAlong } = require("./src/chatter");
const { startContextServer } = require("./src/contextServer");

// ================= SLASH COMMAND DEFINITION =================

const GITARRE_COMMAND = {
  name: "gitarre",
  description: "Finn spielt Musik im Voice Channel",
  options: [
    {
      name: "spiel",
      type: 1, // SUB_COMMAND
      description: "YouTube Video oder Playlist abspielen",
      options: [{ name: "url", type: 3, description: "YouTube Link", required: true }],
    },
    { name: "stopp",   type: 1, description: "Stoppen und Voice verlassen" },
    { name: "nachste", type: 1, description: "Nächsten Track überspringen" },
    { name: "liste",   type: 1, description: "Warteschlange anzeigen" },
    { name: "pause",   type: 1, description: "Pausieren" },
    { name: "weiter",  type: 1, description: "Fortsetzen" },
  ],
};

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

// ================= INTERACTION HANDLER =================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "gitarre") {
    const { handleMusicInteraction } = require("./src/music");
    handleMusicInteraction(interaction).catch(err => console.error("[main] music error:", err));
  }
});

// ================= MESSAGE HANDLER =================

client.on("messageCreate", async msg => {
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

  // Register /gitarre slash command to all guilds (instant, no 1h propagation delay)
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  for (const guild of client.guilds.cache.values()) {
    rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [GITARRE_COMMAND] })
      .then(() => console.log(`[commands] /gitarre registriert in ${guild.name}`))
      .catch(err => console.error(`[commands] Fehler in ${guild.name}:`, err.message));
  }

  const ollamaOk = await waitForOllama();
  const statusText = ollamaOk
    ? "🤖 Finn Wegbier ist online und Ollama läuft."
    : "🤖 Finn Wegbier ist online. ⚠️ Ollama nicht erreichbar.";

  sendStatus(statusText);
  startContextServer();
  console.log("[finn] Bereit.");
});

client.login(DISCORD_TOKEN);
