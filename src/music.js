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
// Tell prism-media (used by @discordjs/voice) where the static ffmpeg binary lives.
process.env.FFMPEG_PATH = require("ffmpeg-static");

// ================= STATE =================
// Per-guild music state — reset on bot restart (voice state is ephemeral).
// Map<guildId: string, GuildMusicState>
const guildStates = new Map();

// ================= PHRASES =================
// All lowercase, no ending punctuation — matches Finn's speech rules.
const PHRASES = {
  join: [
    "jo bin dabei, wo spielt die musik alter",
    "ey ich kletter rein, mal schauen was läuft",
    "bin drin bruder, leg los",
  ],
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

// Pick a random phrase, substituting %s / %d with provided args.
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
  const details = info.video_details;
  return {
    url: details.url,
    title: details.title || url,
    duration: details.durationInSec || 0,
    requestedBy,
  };
}

// Returns TrackInfo[], sends playlist-capped notice to textChannel if needed.
async function resolvePlaylist(url, requestedBy, textChannel) {
  const playlist = await playdl.playlist_info(url, { incomplete: true });
  const videos = playlist.videos || [];
  let capped = false;
  let slice = videos;
  if (slice.length > 50) {
    capped = true;
    slice = slice.slice(0, 50);
  }
  if (capped) {
    textChannel.send(pick(PHRASES.playlistCapped)).catch(() => {});
  }
  return slice.map(v => ({
    url: v.url,
    title: v.title || v.url,
    duration: v.durationInSec || 0,
    requestedBy,
  }));
}

// Validates URL and returns TrackInfo[].
async function resolveUrl(url, requestedBy, textChannel) {
  const validated = await playdl.validate(url);
  if (!validated || !String(validated).startsWith("yt_")) {
    throw new Error("not_youtube");
  }
  if (validated === "yt_playlist") {
    return resolvePlaylist(url, requestedBy, textChannel);
  }
  // yt_video or yt_video_id
  const track = await resolveTrack(url, requestedBy);
  return [track];
}

// ================= PLAYBACK =================

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

  let resource;
  try {
    const stream = await playdl.stream(track.url, { quality: 2 });
    resource = createAudioResource(stream.stream, { inputType: stream.type });
  } catch (err) {
    console.error("[music] stream error:", err.message);
    state.textChannel.send(pick(PHRASES.streamFail)).catch(() => {});
    // Try next track
    return playNext(guildId);
  }

  state.player.play(resource);
  state.textChannel.send(pick(PHRASES.nowPlaying, track.title)).catch(() => {});
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

  // Advance queue when a track finishes
  player.on(AudioPlayerStatus.Idle, () => {
    playNext(guildId).catch(err => console.error("[music] playNext error:", err));
  });

  player.on("error", err => {
    console.error("[music] player error:", err.message);
    playNext(guildId).catch(() => {});
  });

  // Clean up state if the bot is kicked or disconnected
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // Give Discord a moment to reconnect before destroying
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

  textChannel.send(pick(PHRASES.join)).catch(() => {});
}

// ================= COMMANDS =================

async function cmdPlay(msg, args) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }

  const voiceChannel = msg.member.voice?.channel;
  if (!voiceChannel) {
    return msg.channel.send(pick(PHRASES.notInVoice));
  }

  const url = args[0];
  if (!url) {
    return msg.channel.send("gib mir auch nen link alter");
  }

  let tracks;
  try {
    tracks = await resolveUrl(url, msg.member.displayName, msg.channel);
  } catch (err) {
    if (err.message === "not_youtube") {
      return msg.channel.send(pick(PHRASES.notYoutube));
    }
    console.error("[music] resolve error:", err.message);
    return msg.channel.send(pick(PHRASES.badUrl));
  }

  if (!tracks || tracks.length === 0) {
    return msg.channel.send(pick(PHRASES.badUrl));
  }

  const state = getOrCreateState(msg.guild.id, msg.channel);

  // Join voice if not already connected
  if (!state.connection) {
    await joinChannel(voiceChannel, msg.guild.id, msg.channel);
  }

  cancelLeave(msg.guild.id);

  const wasIdle = state.currentTrack === null && state.queue.length === 0;

  if (tracks.length === 1) {
    state.queue.push(tracks[0]);
    if (wasIdle) {
      await playNext(msg.guild.id);
    } else {
      msg.channel.send(pick(PHRASES.queued, tracks[0].title)).catch(() => {});
    }
  } else {
    state.queue.push(...tracks);
    msg.channel.send(pick(PHRASES.playlistQueued, tracks.length)).catch(() => {});
    if (wasIdle) {
      await playNext(msg.guild.id);
    }
  }
}

async function cmdStop(msg) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }
  if (!guildStates.has(msg.guild.id)) {
    return msg.channel.send(pick(PHRASES.notPlaying));
  }
  msg.channel.send(pick(PHRASES.stop)).catch(() => {});
  destroyState(msg.guild.id);
}

async function cmdSkip(msg) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }
  const state = guildStates.get(msg.guild.id);
  if (!state || !state.currentTrack) {
    return msg.channel.send(pick(PHRASES.nothingPlaying));
  }
  msg.channel.send(pick(PHRASES.skip)).catch(() => {});
  // Stopping the player triggers the Idle event which calls playNext automatically
  state.player.stop();
}

async function cmdListe(msg) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }
  const state = guildStates.get(msg.guild.id);
  if (!state || (!state.currentTrack && state.queue.length === 0)) {
    return msg.channel.send(pick(PHRASES.nothingPlaying));
  }

  const lines = [PHRASES.queueHeader];
  if (state.currentTrack) {
    const dur = formatDuration(state.currentTrack.duration);
    lines.push(`1. [jetzt] ${state.currentTrack.title} (${dur}) — ${state.currentTrack.requestedBy}`);
  }
  const shown = state.queue.slice(0, 10);
  shown.forEach((t, i) => {
    const dur = formatDuration(t.duration);
    const num = state.currentTrack ? i + 2 : i + 1;
    lines.push(`${num}. ${t.title} (${dur}) — ${t.requestedBy}`);
  });
  if (state.queue.length > 10) {
    lines.push(`… (${state.queue.length - 10} weitere)`);
  }

  msg.channel.send(lines.join("\n")).catch(() => {});
}

async function cmdPause(msg) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }
  const state = guildStates.get(msg.guild.id);
  if (!state || !state.currentTrack) {
    return msg.channel.send(pick(PHRASES.nothingPlaying));
  }
  if (state.isPaused) return;
  state.player.pause();
  state.isPaused = true;
  msg.channel.send(pick(PHRASES.pause)).catch(() => {});
}

async function cmdWeiter(msg) {
  if (!checkRole(msg.member)) {
    return msg.channel.send(pick(PHRASES.noPermission));
  }
  const state = guildStates.get(msg.guild.id);
  if (!state || !state.currentTrack) {
    return msg.channel.send(pick(PHRASES.nothingPlaying));
  }
  if (!state.isPaused) return;
  state.player.unpause();
  state.isPaused = false;
  msg.channel.send(pick(PHRASES.resume)).catch(() => {});
}

// ================= HELPERS =================

function formatDuration(seconds) {
  if (!seconds) return "?:??";
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ================= COMMAND ROUTER =================

async function handleMusicCommand(msg) {
  if (!msg.guild) return; // Ignore DMs

  const parts = msg.content.trim().split(/\s+/);
  // parts[0] = "!gitarre", parts[1] = subcommand, parts[2+] = args
  const sub = (parts[1] || "").toLowerCase();
  const args = parts.slice(2);

  switch (sub) {
    case "spiel":   return cmdPlay(msg, args);
    case "stopp":   return cmdStop(msg);
    case "nächste":
    case "nachste": return cmdSkip(msg);   // fallback without umlaut
    case "liste":   return cmdListe(msg);
    case "pause":   return cmdPause(msg);
    case "weiter":  return cmdWeiter(msg);
    default:
      return msg.channel.send(
        "commands: `!gitarre spiel <url>` · `stopp` · `nächste` · `liste` · `pause` · `weiter`"
      );
  }
}

module.exports = { handleMusicCommand };
