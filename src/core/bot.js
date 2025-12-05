import mineflayer from "mineflayer"
import pf from "mineflayer-pathfinder"
const { pathfinder } = pf

import { attachEventHandlers } from "./events.js"
import { createBrain } from "../brain/brain.js"
import { createCommandHandler } from "../commands/commandHandler.js"
import { createProfessionManager } from "../professions/manager.js"

function createLogger(botName) {
  return (...messages) => console.log(`[${botName}]`, ...messages)
}

export function startBot(name = "Max") {
  const bot = mineflayer.createBot({
    host: "localhost",
    port: 25565,
    username: name,
    version: "1.20.6",
  })

  const logger = createLogger(name)

  // Registrar módulos no bot (injeção de dependências)
  bot.brain = createBrain(logger)
  bot.commandHandler = createCommandHandler(bot.brain.stateManager, logger)
  bot.professions = createProfessionManager(bot, logger)

  bot.loadPlugin(pathfinder)

  bot.once("spawn", () => {
    logger("online e inicializando módulos...")
    bot.chat(`${bot.username} online e inicializando módulos...`)

    bot.brain.initialize(bot)
    attachEventHandlers(bot, logger)
  })

  return bot
}
