import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "assets/sfx/README.md",
  "assets/sfx/button_click.wav",
  "assets/sfx/dice_roll.wav",
  "assets/sfx/score_lock.wav",
  "assets/sfx/confetti_pop.wav",
  "assets/sfx/buzzer.wav",
  ".github/workflows/pages.yml"
];

const requiredText = [
  ["src/app.js", "MAX_PLAYERS = 4"],
  ["src/app.js", "localStorage"],
  ["src/app.js", "upperBonus"],
  ["src/app.js", "yahtzeeBonus"],
  ["src/app.js", "fullHouse"],
  ["src/app.js", "smallStraight"],
  ["src/app.js", "largeStraight"],
  ["src/app.js", "createConfetti"],
  ["src/app.js", "RELAY_HEARTBEAT_MS"],
  ["src/app.js", "voice_01"],
  ["src/styles.css", "portrait-shell"],
  ["src/styles.css", "roll-button"],
  ["src/styles.css", "character-line"]
];

let failed = false;

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    console.error(`missing ${file}`);
    failed = true;
  }
}

for (const [file, text] of requiredText) {
  const body = readFileSync(join(root, file), "utf8");
  if (!body.includes(text)) {
    console.error(`missing marker "${text}" in ${file}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Yachoo static verification passed.");
