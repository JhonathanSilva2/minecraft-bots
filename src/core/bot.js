import mineflayer from "mineflayer"
import pf from "mineflayer-pathfinder"
const { pathfinder } = pf
import mcDataLoader from "minecraft-data"

import { attachEventHandlers } from "./events.js"
import { createBrain } from "../brain/brain.js"
import { createCommandHandler } from "../commands/commandHandler.js"
import { createProfessionManager } from "../professions/manager.js"
import { createSmartMovement } from "../modules/smartMovement/index.js"
import { writeFileSync } from "fs"

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
    bot.mcData = mcDataLoader(bot.version)
    console.log("Bot MC version:", bot.version)
    console.log("Loaded mcData version:", bot.mcData?.version)
    console.log("Total recipes:", bot.mcData?.recipes?.length)
    console.log(
      "Crafting table exists?",
      !!bot.mcData.itemsByName["crafting_table"]
    )

    // gerar json de mcData items
    writeFileSync(
      `mcdata-items-${bot.version}.json`,
      JSON.stringify(bot.mcData.itemsByName, null, 2)
    )
    createSmartMovement(bot, logger)
    bot.brain.initialize(bot)
    attachEventHandlers(bot, logger)
  })

  return bot
}
