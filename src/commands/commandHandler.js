import followCommand from "./followCommand.js";
import stopCommand from "./stopCommand.js";

export function commandHandler(bot, username, message) {
  const args = message.split(" ");
  const cmd = args[0];

  if (cmd === "!seguir") followCommand(bot, username);
  if (cmd === "!parar") stopCommand(bot, username);
}
