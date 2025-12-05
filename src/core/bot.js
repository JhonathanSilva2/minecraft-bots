import mineflayer from "mineflayer"
import pf from "mineflayer-pathfinder"
const { pathfinder } = pf

import { attachEventHandlers } from "./events.js"
import { brain } from "../brain/brain.js"

export function startBot(name = "Max") {
  const bot = mineflayer.createBot({
    host: "localhost",
    port: 25565,
    username: name,
    version: "1.20.6",
  })

  bot.loadPlugin(pathfinder)

  bot.once("spawn", () => {
    bot.chat("Max online e inicializando módulos...")
    attachEventHandlers(bot)

    // AGORA SIM: só depois do spawn!
    brain.initialize(bot)
  })

  return bot
}
