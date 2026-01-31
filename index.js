require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");

const {
  DISCORD_TOKEN,
  STATUS_CHANNEL_ID,
  VAGABOT_ID,
  REACTION_CHANCE
} = require("./src/config");

const {
  extractKeyMemory,
  updateMemoryWithAI
} = require("./src/memory");

const {
  askFinn,
  isFinnAddressed
} = require("./src/ai");

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= STATUS =================
function sendStatus(text) {
  const ch = client.channels.cache.get(STATUS_CHANNEL_ID);
  if (ch) ch.send(text).catch(() => {});
}


// ================= MINIGAME REACTIONS =================
/**
 * Detects if a VagaBot embed is a game result and returns the type.
 * @returns {{ type: 'win' | 'loss' | null, gameName: string, playerName: string, amount: string }}
 */
function parseGameResult(embed) {
  if (!embed || !embed.title) return { type: null };

  const title = embed.title.toLowerCase();
  const description = (embed.description || "").toLowerCase();

  // Detect game type from title
  let gameName = "Minigame";
  if (title.includes("coinflip") || title.includes("münze")) gameName = "Coinflip";
  else if (title.includes("high-low") || title.includes("highlow")) gameName = "High-Low";
  else if (title.includes("roulette")) gameName = "Roulette";
  else if (title.includes("duell")) gameName = "Duell";

  // Extract player name from fields if available
  let playerName = "";
  let amount = "";

  if (embed.fields) {
    for (const field of embed.fields) {
      if (field.name.includes("Gewinner") || field.name.includes("🏆")) {
        playerName = field.value.replace(/\*\*/g, "").split("\n")[0];
      }
      if (field.name.includes("Gewinn") || field.name.includes("Verlust") || field.name.includes("Verloren")) {
        amount = field.value;
      }
    }
  }

  // Win detection
  if (
    title.includes("gewonnen") ||
    title.includes("gewinner") ||
    title.includes("ausgezahlt") ||
    title.includes("perfekt") ||
    description.includes("gewonnen") ||
    description.includes("überlebt")
  ) {
    return { type: "win", gameName, playerName, amount };
  }

  // Loss detection
  if (
    title.includes("verloren") ||
    title.includes("peng") ||
    title.includes("💔") ||
    description.includes("verloren") ||
    description.includes("falsch geraten")
  ) {
    return { type: "loss", gameName, playerName, amount };
  }

  return { type: null };
}

/**
 * Generates a Finn-style reaction to game results.
 */
async function reactToGameResult(msg, result) {
  // Random chance to react (don't spam every game)
  if (Math.random() > REACTION_CHANCE) return;

  // Add small delay to seem more natural (1-3 seconds)
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

  const winReactions = [
    "ey bruder richtig dusel gehabt, gib mal nen schluck aus 🍻",
    "jo mann respekt, das nenn ich glück auf der straße",
    "oha da haste aber kohle gemacht bruder",
    "jo läuft bei dir mann, prost drauf 🍺",
    "boah bruder davon kauf ich mir ne woche wegbier und stullen",
    "ey sauber mann, so muss das"
  ];

  const lossReactions = [
    "uff bruder das tat weh, kenn ich 😬",
    "jo passiert mann, morgen sieht die welt anders aus",
    "ey kopf hoch bruder, weiter tippeln",
    "na das war wohl nix, willste schluck bier zum trost 🍺",
    "pech gehabt mann aber mut haste, respekt",
    "mies bruder, aber die straße gibt und nimmt"
  ];

  const bigWinReactions = [
    "alter bruder so viel kohle hab ich noch nie gesehen 🍻",
    "boah mann davon könnt ich n jahr auf platte leben",
    "jo bruder lad mich mal auf ne stulle und n wegbier ein"
  ];

  const bigLossReactions = [
    "uff bruder das war heftig, komm wir teilen mein bier 🍺",
    "autsch mann das hat sogar mir wehgetan und ich mach platte",
    "mies bruder, aber denk dran: kohle ist nicht alles im leben"
  ];

  let reactions;

  // Check for big amounts (over 500 coins)
  const isBigAmount = result.amount && parseInt(result.amount.replace(/\D/g, "")) > 500;

  if (result.type === "win") {
    reactions = isBigAmount ? bigWinReactions : winReactions;
  } else {
    reactions = isBigAmount ? bigLossReactions : lossReactions;
  }

  const reaction = reactions[Math.floor(Math.random() * reactions.length)];

  try {
    await msg.channel.send(reaction);
  } catch (err) {
    console.error("Failed to send game reaction:", err);
  }
}

// ================= BOT COMMANDS =================
client.on("messageCreate", async msg => {
  // Check for VagaBot game results
  if (msg.author.id === VAGABOT_ID && msg.embeds.length > 0) {
    const result = parseGameResult(msg.embeds[0]);
    if (result.type) {
      await reactToGameResult(msg, result);
    }
    return;
  }

  if (msg.author.bot) return;

  // Text Chat Logic
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
      const answer = await askFinn(text, userId);
      msg.reply(answer);
    } catch (err) {
      console.error("Text Chat Error:", err);
      msg.reply("ey bruder da is was schiefgelaufen, frag nochmal");
    }
  }
});

// ================= READY =================
client.once(Events.ClientReady, () => {
  sendStatus("🤖 Finn Wegbier ist online.");
  console.log("✅ Finn ist bereit.");
});

client.login(DISCORD_TOKEN);
