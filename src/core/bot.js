import mineflayer from "mineflayer"
import pf from "mineflayer-pathfinder"
const { pathfinder } = pf
import mcDataLoader from "minecraft-data"

import { attachEventHandlers } from "./events.js"
import { createBrain } from "../brain/brain.js"
import { createCommandHandler } from "../commands/commandHandler.js"
import { createProfessionManager } from "../professions/manager.js"
import { writeFileSync } from "fs"
import MovementManager from "../modules/movement/MovementManager.js"
import LocationManager from "../modules/location/LocationManager.js"

import "dotenv/config"

const address = process.env.SERVIDOR_ADDRESS

function createLogger(botName) {
  return (...messages) => console.log(`[${botName}]`, ...messages)
}

export function startBot(name = "Max", options = {}) {
  const { defaultProfessions = [] } = options

  const bot = mineflayer.createBot({
    host: address,
    port: 25565,
    username: name,
    version: "1.20.6",
  })

  // Inicializar módulos personalizados
  const logger = createLogger(name)

  bot.movement = new MovementManager(bot)
  bot.locations = new LocationManager(bot, logger)

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
    // createSmartMovement(bot, logger)

    bot.brain.initialize(bot)
    attachEventHandlers(bot, logger)

    if (defaultProfessions.length) {
      for (const professionName of defaultProfessions) {
        const ok = bot.professions.enable(professionName)
        if (!ok) {
          logger(`[startup] profissao '${professionName}' nao encontrada`)
        }
      }
    }
  })

  return bot
}
