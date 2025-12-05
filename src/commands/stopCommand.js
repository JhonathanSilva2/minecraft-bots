import { stateManager } from "../brain/stateManager.js";

export default function stopCommand(bot) {
  bot.chat("Parando.");
  stateManager.setState("idle", bot);
}
