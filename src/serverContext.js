"use strict";

// Live-Schnappschuss des Discord-Servers fuer Finns Kontext:
// wer im Voice haengt + was gerade gezockt wird.
// Braucht die Intents GuildVoiceStates (Voice) und GuildPresences (Spiele).

function buildServerContext(guild) {
  if (!guild) return null;
  try {
    // ---- Voice ----
    let voiceCount = 0;
    const voiceChannels = {};
    for (const [, ch] of guild.channels.cache) {
      if (typeof ch.isVoiceBased === "function" && ch.isVoiceBased()) {
        const humans = ch.members.filter(m => !m.user.bot).size;
        if (humans > 0) { voiceChannels[ch.name] = humans; voiceCount += humans; }
      }
    }

    // ---- Spiele (Presence, type 0 = Playing) ----
    const games = {};
    for (const [, member] of guild.members.cache) {
      if (member.user.bot) continue;
      const acts = (member.presence && member.presence.activities) || [];
      for (const a of acts) {
        if (a.type === 0 && a.name) games[a.name] = (games[a.name] || 0) + 1;
      }
    }
    const topGames = Object.entries(games).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const parts = [];
    if (voiceCount > 0) {
      const chNames = Object.entries(voiceChannels)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n, c]) => `${c} in ${n}`);
      parts.push(`voice: ${chNames.join(", ")}`);
    }
    if (topGames.length) {
      parts.push(`gezockt: ${topGames.map(([n, c]) => (c > 1 ? `${c}x ${n}` : n)).join(", ")}`);
    }
    return parts.length ? parts.join(" | ") : null;
  } catch (err) {
    console.error("[serverctx] error:", err.message);
    return null;
  }
}

module.exports = { buildServerContext };
