import { commandHandler } from "../commands/commandHandler.js";

export function attachEventHandlers(bot) {
  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    commandHandler(bot, username, message);
  });
}
