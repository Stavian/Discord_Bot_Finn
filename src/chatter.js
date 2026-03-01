const { CHATTER_CHANCE, CHATTER_COOLDOWN_MS, FINN_SYSTEM_PROMPT } = require("./config");
const { casualify, callOllama } = require("./ai");

// Per-channel cooldown tracker: channelId → last chatter timestamp
const cooldowns = new Map();

function canChatter(channelId) {
  const last = cooldowns.get(channelId) || 0;
  return Date.now() - last >= CHATTER_COOLDOWN_MS;
}

function shouldChatter() {
  return Math.random() < CHATTER_CHANCE;
}

function isSkippable(text) {
  if (!text || text.length < 5) return true;
  if (text.startsWith("!") || text.startsWith("/") || text.startsWith(".")) return true;
  // Skip pure URLs
  if (/^https?:\/\/\S+$/.test(text.trim())) return true;
  return false;
}

// Build a lightweight side-comment prompt (no full history needed)
function buildChatterPrompt(text) {
  return `jemand in deinem discord schreibt gerade: "${text}"\n\nreagier kurz und spontan als finn wegbier - ein satz, kein satzeichen am ende, alles klein, auf deutsch`;
}

/**
 * Proactive random chatter engine.
 * Called for every message that doesn't directly address Finn.
 * Uses a lightweight prompt — no user history needed for background comments.
 *
 * @param {import("discord.js").Message} msg
 */
async function maybeChatAlong(msg) {
  if (!shouldChatter()) return;
  if (!canChatter(msg.channel.id)) return;
  if (isSkippable(msg.content)) return;

  cooldowns.set(msg.channel.id, Date.now());

  // Small random delay (2–5s) so it feels natural, not instant
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

  try {
    const chatterPrompt = buildChatterPrompt(msg.content.slice(0, 200));
    const messages = [
      { role: "system", content: FINN_SYSTEM_PROMPT },
      { role: "user", content: chatterPrompt }
    ];
    const raw = await callOllama(messages);
    if (!raw) return;

    const text = casualify(raw);
    if (text && text.length >= 3) {
      await msg.channel.send(text);
      console.log("[chatter] spontan:", text);
    }
  } catch (err) {
    console.error("[chatter] error:", err.message);
  }
}

module.exports = { maybeChatAlong };
