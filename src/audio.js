const fs = require("fs");
const path = require("path");

function prepareTextForSpeech(text) {
  let t = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9äöüÄÖÜß.,!? ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = t.split(/[.!?]/).filter(Boolean).slice(0, 2);
  t = sentences.join(". ");

  return (
    t
      .replace(/, /g, ",  ")
      .replace(/\. /g, "... ")
      .replace(/\?/g, "?  ")
      .replace(/!/g, "!  ")
      .slice(0, 240) + "."
  );
}

function writeWavFile(filePath, pcmBuffer, sampleRate = 48000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  fs.writeFileSync(filePath, Buffer.concat([header, pcmBuffer]));
}

function cleanupOldFiles(dir, maxAgeMinutes) {
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  fs.readdir(dir, (_, files) => {
    if (!files) return;
    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (_, stats) => {
        if (!stats) return;
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}

module.exports = {
  prepareTextForSpeech,
  writeWavFile,
  cleanupOldFiles
};
