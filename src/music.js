"use strict";

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const playdl = require("play-dl");
const { MUSIC_ROLE_IDS } = require("./config");

// ================= FFMPEG SETUP =================
process.env.FFMPEG_PATH = require("ffmpeg-static");

// ================= STATE =================
// Map<guildId: string, GuildMusicState> — in-memory, resets on bot restart
const guildStates = new Map();

// ================= PHRASES =================
// All lowercase, no ending punctuation — matches Finn's speech rules
const PHRASES = {
  nowPlaying: [
    "leg auf: %s",
    "jo läuft: %s",
    "ey gut, spiel grad: %s",
  ],
  queued: [
    "hab %s hinten angestellt, läuft gleich",
    "jo %s kommt noch, warte kurz",
    "track ist drin: %s",
  ],
  playlistQueued: [
    "ey %d songs reingepackt, das wird ne runde",
    "%d tracks aus der playlist, haben wir zeit für",
    "jo %d lieder in der schlange, gemütlich",
  ],
  playlistCapped: [
    "ey die playlist hat mehr als 50 songs, ich nehm nur die ersten 50 bruder",
  ],
  queueHeader: "aktuelle schlange bruder:",
  queueEmpty: [
    "schlange ist leer alter, leg was auf",
    "nix mehr in der pipeline, hast du nen vorschlag",
    "alles abgespielt bruder, gibts noch mehr",
  ],
  stop: [
    "jo stop, ich kletter wieder raus",
    "abgedreht bruder, tschüss voice",
    "musik aus, ich zieh weiter",
  ],
  skip: [
    "übersprungen, weiter gehts",
    "jo nächster bruder",
    "weg damit, was kommt danach",
  ],
  pause: [
    "kurze pause bruder",
    "angehalten, sag wenn weiter",
    "jo pausiert, ich warte",
  ],
  resume: [
    "weiter gehts alter",
    "jo läuft wieder",
    "wieder am start bruder",
  ],
  notInVoice: [
    "ey komm erstmal in n voice channel bruder",
    "musst du dich in nen kanal setzen alter",
    "ich weiß nicht wo du bist, geh in nen voice kanal",
  ],
  noPermission: [
    "nee bruder das ist nicht für dich",
    "ey kenn ich dich, du darfst das nicht",
    "hast keine erlaubnis dafür alter",
  ],
  badUrl: [
    "was soll das sein bruder, gib mir nen richtigen youtube link",
    "kenn den link nicht alter, probiers nochmal",
    "ey das ist kein gültiger link bruder",
  ],
  notYoutube: [
    "nur youtube links bruder, ich bin kein wunderkind",
    "muss youtube sein alter, andere seiten kenn ich nicht",
  ],
  streamFail: [
    "ey das video läuft nicht, probiers mit nem anderen",
    "stream kaputt bruder, irgendwas stimmt nicht",
    "hat nicht geklappt alter, anderes video",
  ],
  nothingPlaying: [
    "läuft grad nix bruder",
    "kein musik an alter",
    "nix zu machen, queue ist leer",
  ],
  notPlaying: [
    "ich bin grad gar nicht in nem kanal alter",
    "ich spiel doch gar nix gerade bruder",
  ],
};

// Pick a random phrase, substituting %s / %d with provided args
function pick(pool, ...args) {
  const tpl = Array.isArray(pool)
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool;
  return args.reduce((s, a) => s.replace(/%[sd]/, String(a)), tpl);
}

// ================= ROLE CHECK =================

function checkRole(member) {
  if (!MUSIC_ROLE_IDS || MUSIC_ROLE_IDS.length === 0) return true;
  return member.roles.cache.some(role => MUSIC_ROLE_IDS.includes(role.id));
}

// ================= STATE MANAGEMENT =================

function getOrCreateState(guildId, textChannel) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      player: null,
      queue: [],
      currentTrack: null,
      isPaused: false,
      textChannel,
      leaveTimer: null,
      firstPlay: false, // suppresses nowPlaying textChannel.send for interaction-initiated play
    });
  }
  return guildStates.get(guildId);
}

function destroyState(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;
  if (state.leaveTimer) clearTimeout(state.leaveTimer);
  try { state.player?.stop(true); } catch (_) {}
  try { state.connection?.destroy(); } catch (_) {}
  guildStates.delete(guildId);
}

function scheduleLeave(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;
  if (state.leaveTimer) clearTimeout(state.leaveTimer);
  state.leaveTimer = setTimeout(() => destroyState(guildId), 30_000);
}

function cancelLeave(guildId) {
  const state = guildStates.get(guildId);
  if (!state || !state.leaveTimer) return;
  clearTimeout(state.leaveTimer);
  state.leaveTimer = null;
}

// ================= URL RESOLUTION =================

async function resolveTrack(url, requestedBy) {
  const info = await playdl.video_info(url);
  const d = info.video_details;
  // Use original url — d.url can have unexpected formats that playdl.stream() rejects
  return { url, title: d.title || url, duration: d.durationInSec || 0, requestedBy };
}

async function resolvePlaylist(url, requestedBy, textChannel) {
  const playlist = await playdl.playlist_info(url, { incomplete: true });
  const videos = playlist.videos || [];
  let slice = videos;
  if (slice.length > 50) {
    slice = slice.slice(0, 50);
    textChannel.send(pick(PHRASES.playlistCapped)).catch(() => {});
  }
  return slice.map(v => ({
    // Construct canonical URL from ID — v.url can be undefined for unavailable playlist entries
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: v.title || v.id || "Unbekannt",
    duration: v.durationInSec || 0,
    requestedBy,
  }));
}

async function resolveUrl(url, requestedBy, textChannel) {
  const validated = await playdl.validate(url);
  if (!validated || !String(validated).startsWith("yt_")) throw new Error("not_youtube");
  if (validated === "yt_playlist") return resolvePlaylist(url, requestedBy, textChannel);
  return [await resolveTrack(url, requestedBy)];
}

// ================= PLAYBACK =================

// firstPlay flag suppresses the nowPlaying message when the interaction reply
// already serves as the "now playing" confirmation for the first track.
async function playNext(guildId) {
  const state = guildStates.get(guildId);
  if (!state) return;

  if (state.queue.length === 0) {
    state.currentTrack = null;
    state.textChannel.send(pick(PHRASES.queueEmpty)).catch(() => {});
    scheduleLeave(guildId);
    return;
  }

  const track = state.queue.shift();
  state.currentTrack = track;

  const isFirst = state.firstPlay;
  state.firstPlay = false;

  let resource;
  try {
    const stream = await playdl.stream(track.url, { quality: 2 });
    resource = createAudioResource(stream.stream, { inputType: stream.type });
  } catch (err) {
    console.error("[music] stream error:", err.message);
    if (!isFirst) state.textChannel.send(pick(PHRASES.streamFail)).catch(() => {});
    return playNext(guildId);
  }

  state.player.play(resource);
  if (!isFirst) {
    state.textChannel.send(pick(PHRASES.nowPlaying, track.title)).catch(() => {});
  }
}

async function joinChannel(voiceChannel, guildId, textChannel) {
  const state = getOrCreateState(guildId, textChannel);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  state.connection = connection;
  state.player = player;

  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId).catch(err => console.error("[music] playNext error:", err));
  });

  player.on("error", err => {
    console.error("[music] player error:", err.message);
    playNext(guildId).catch(() => {});
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      destroyState(guildId);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    destroyState(guildId);
  });
}

// ================= COMMANDS =================

async function cmdSpiel(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) {
    return interaction.reply({ content: pick(PHRASES.notInVoice), ephemeral: true });
  }

  const url = interaction.options.getString("url");
  await interaction.deferReply();

  let tracks;
  try {
    tracks = await resolveUrl(url, interaction.member.displayName, interaction.channel);
  } catch (err) {
    if (err.message === "not_youtube") return interaction.editReply(pick(PHRASES.notYoutube));
    console.error("[music] resolve error:", err.message);
    return interaction.editReply(pick(PHRASES.badUrl));
  }
  if (!tracks || tracks.length === 0) return interaction.editReply(pick(PHRASES.badUrl));

  const state = getOrCreateState(interaction.guild.id, interaction.channel);
  if (!state.connection) await joinChannel(voiceChannel, interaction.guild.id, interaction.channel);

  cancelLeave(interaction.guild.id);

  const wasIdle = state.currentTrack === null && state.queue.length === 0;
  state.queue.push(...tracks);

  if (wasIdle) {
    state.firstPlay = true;
    await playNext(interaction.guild.id);
    // state.currentTrack is now set by playNext
    const title = state.currentTrack?.title ?? tracks[0].title;
    if (tracks.length === 1) {
      await interaction.editReply(pick(PHRASES.nowPlaying, title));
    } else {
      await interaction.editReply(pick(PHRASES.playlistQueued, tracks.length));
    }
  } else {
    if (tracks.length === 1) {
      await interaction.editReply(pick(PHRASES.queued, tracks[0].title));
    } else {
      await interaction.editReply(pick(PHRASES.playlistQueued, tracks.length));
    }
  }
}

async function cmdStopp(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  if (!guildStates.has(interaction.guild.id)) {
    return interaction.reply(pick(PHRASES.notPlaying));
  }
  await interaction.reply(pick(PHRASES.stop));
  destroyState(interaction.guild.id);
}

async function cmdNachste(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  const state = guildStates.get(interaction.guild.id);
  if (!state || !state.currentTrack) return interaction.reply(pick(PHRASES.nothingPlaying));
  state.isPaused = false;
  await interaction.reply(pick(PHRASES.skip));
  state.player.stop(); // triggers Idle → playNext
}

async function cmdListe(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  const state = guildStates.get(interaction.guild.id);
  if (!state || (!state.currentTrack && state.queue.length === 0)) {
    return interaction.reply(pick(PHRASES.nothingPlaying));
  }

  const lines = [PHRASES.queueHeader];
  if (state.currentTrack) {
    lines.push(`1. [jetzt] ${state.currentTrack.title} (${formatDuration(state.currentTrack.duration)}) — ${state.currentTrack.requestedBy}`);
  }
  state.queue.slice(0, 10).forEach((t, i) => {
    const num = state.currentTrack ? i + 2 : i + 1;
    lines.push(`${num}. ${t.title} (${formatDuration(t.duration)}) — ${t.requestedBy}`);
  });
  if (state.queue.length > 10) lines.push(`… (${state.queue.length - 10} weitere)`);

  await interaction.reply(lines.join("\n"));
}

async function cmdPause(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  const state = guildStates.get(interaction.guild.id);
  if (!state || !state.currentTrack) return interaction.reply(pick(PHRASES.nothingPlaying));
  if (state.isPaused) return interaction.reply({ content: "schon pausiert bruder", ephemeral: true });
  state.player.pause();
  state.isPaused = true;
  await interaction.reply(pick(PHRASES.pause));
}

async function cmdWeiter(interaction) {
  if (!checkRole(interaction.member)) {
    return interaction.reply({ content: pick(PHRASES.noPermission), ephemeral: true });
  }
  const state = guildStates.get(interaction.guild.id);
  if (!state || !state.currentTrack) return interaction.reply(pick(PHRASES.nothingPlaying));
  if (!state.isPaused) return interaction.reply({ content: "läuft doch schon bruder", ephemeral: true });
  state.player.unpause();
  state.isPaused = false;
  await interaction.reply(pick(PHRASES.resume));
}

// ================= HELPERS =================

function formatDuration(seconds) {
  if (!seconds) return "?:??";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ================= INTERACTION ROUTER =================

async function handleMusicInteraction(interaction) {
  if (!interaction.guild) return;
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case "spiel":   return cmdSpiel(interaction);
    case "stopp":   return cmdStopp(interaction);
    case "nachste": return cmdNachste(interaction);
    case "liste":   return cmdListe(interaction);
    case "pause":   return cmdPause(interaction);
    case "weiter":  return cmdWeiter(interaction);
  }
}

module.exports = { handleMusicInteraction };
