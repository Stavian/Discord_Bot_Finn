const { REACTION_CHANCE } = require("./config");

// ================= GAME RESULT PARSER =================

function parseGameResult(embed, finnId) {
  if (!embed?.title) return { type: null };

  const title = embed.title.toLowerCase();
  const desc = (embed.description || "").toLowerCase();

  let gameName = "Minigame";
  if (title.includes("coinflip") || title.includes("münze")) gameName = "Coinflip";
  else if (title.includes("high-low") || title.includes("highlow")) gameName = "High-Low";
  else if (title.includes("roulette")) gameName = "Roulette";
  else if (title.includes("duell") || title.includes("würfel")) gameName = "Duell";

  let playerName = "";
  let amount = "";
  let finnInvolved = false;
  let finnWon = false;
  const isTie = title.includes("unentschieden") || desc.includes("unentschieden");

  if (embed.fields) {
    for (const field of embed.fields) {
      const fName = field.name.toLowerCase();
      const fVal = field.value.toLowerCase();

      if (fVal.includes("finn wegbier") || fVal.includes(finnId)) {
        finnInvolved = true;
      }

      if (fName.includes("gewinner") || fName.includes("🏆")) {
        playerName = field.value.replace(/\*\*/g, "").split("\n")[0];
        if (fVal.includes("finn wegbier") || fVal.includes(finnId)) {
          finnWon = true;
        }
      }

      if (fName.includes("verlierer") || fName.includes("💔")) {
        if (fVal.includes("finn wegbier") || fVal.includes(finnId)) {
          finnInvolved = true;
          finnWon = false;
        }
      }

      if (fName.includes("gewinn") || fName.includes("pot")) {
        const m = field.value.match(/[\d.,]+/);
        if (m) amount = m[0];
      }
    }
  }

  if (desc.includes("finn wegbier") || desc.includes(finnId)) finnInvolved = true;

  const isWin =
    title.includes("gewonnen") || title.includes("gewinner") ||
    title.includes("ausgezahlt") || title.includes("perfekt") ||
    desc.includes("gewonnen") || desc.includes("überlebt") ||
    title.includes("ergebnis");

  const isLoss =
    title.includes("verloren") || title.includes("peng") ||
    title.includes("💔") || desc.includes("verloren") ||
    desc.includes("falsch geraten");

  const type = isWin ? "win" : isLoss ? "loss" : null;
  return { type, gameName, playerName, amount, finnInvolved, finnWon, isTie };
}

// ================= FINN'S OWN GAME REACTIONS =================

const OWN_WIN = [
  "haha ja mann, davon kauf ich mir n paar wegbier 🍻",
  "jo laeuft bei mir bruder, easy kohle gemacht",
  "ey danke fuers mitmachen, das bier geht auf dich 🍺",
  "boah mann, heute penn ich im warmen",
  "nice bruder, die strasse war mir heute hold",
  "jo das war mein tag, prost drauf 🍺"
];

const OWN_LOSS = [
  "mies bruder, aber egal kohle ist eh nur schmonzes",
  "uff coins weg, naja morgen sieht die welt anders aus",
  "pech gehabt mann, aber die strasse gibt und nimmt",
  "autsch das tat weh, brauch jetzt erstmal n bier 🍺",
  "jo mies, aber hey geld macht eh nicht gluecklich",
  "ey scheisse, naja weiter tippeln"
];

const OWN_TIE = [
  "jo gleichstand bruder, nochmal?",
  "ey unentschieden, das zaehlt nicht richtig",
  "hm patt, lass nochmal wuerfeln mann"
];

async function reactToOwnGame(msg, result) {
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
  const pool = result.isTie ? OWN_TIE : result.finnWon ? OWN_WIN : OWN_LOSS;
  const text = pool[Math.floor(Math.random() * pool.length)];
  try {
    await msg.channel.send(text);
  } catch (err) {
    console.error("[reactions] own game send error:", err);
  }
}

// ================= REACTIONS TO OTHERS' GAMES =================

const WIN_SMALL = [
  "ey bruder richtig dusel gehabt, gib mal nen schluck aus 🍻",
  "jo mann respekt, das nenn ich glueck auf der strasse",
  "oha da haste aber kohle gemacht bruder",
  "jo laeuft bei dir mann, prost drauf 🍺",
  "ey sauber mann, so muss das"
];

const WIN_BIG = [
  "alter bruder so viel kohle hab ich noch nie gesehen 🍻",
  "boah mann davon koennt ich n jahr auf platte leben",
  "jo bruder lad mich mal auf ne stulle und n wegbier ein"
];

const LOSS_SMALL = [
  "uff bruder das tat weh, kenn ich",
  "jo passiert mann, morgen sieht die welt anders aus",
  "ey kopf hoch bruder, weiter tippeln",
  "na das war wohl nix, willste schluck bier zum trost 🍺",
  "mies bruder, aber die strasse gibt und nimmt"
];

const LOSS_BIG = [
  "uff bruder das war heftig, komm wir teilen mein bier 🍺",
  "autsch mann das hat sogar mir wehgetan und ich mach platte",
  "mies bruder, aber denk dran: kohle ist nicht alles im leben"
];

async function reactToOthersGame(msg, result) {
  if (Math.random() > REACTION_CHANCE) return;
  await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

  const isBig = result.amount && parseInt(result.amount.replace(/\D/g, "")) > 500;
  let pool;
  if (result.type === "win") pool = isBig ? WIN_BIG : WIN_SMALL;
  else pool = isBig ? LOSS_BIG : LOSS_SMALL;

  const text = pool[Math.floor(Math.random() * pool.length)];
  try {
    await msg.channel.send(text);
  } catch (err) {
    console.error("[reactions] others game send error:", err);
  }
}

// ================= ENTRY POINT =================

async function handleVagaBotMessage(msg, botUserId) {
  if (!msg.embeds.length) return;
  const result = parseGameResult(msg.embeds[0], botUserId);

  if (result.finnInvolved && (result.type || result.isTie)) {
    await reactToOwnGame(msg, result);
    return;
  }

  if (result.type) {
    await reactToOthersGame(msg, result);
  }
}

module.exports = { handleVagaBotMessage };
