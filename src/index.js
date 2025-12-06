import { startBot } from "./core/bot.js"
import { getBotConfigs } from "./utils/getBotName.js"

const botConfigs = getBotConfigs()

console.log(
  "Iniciando bots:",
  botConfigs.map((cfg) => cfg.name).join(", ")
)

async function startBotsSequentially() {
  for (const cfg of botConfigs) {
    console.log(`Iniciando bot ${cfg.name}...`)
    startBot(cfg.name, { defaultProfessions: cfg.professions })

    // Aguarda 1 segundo para evitar ECONNRESET
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

startBotsSequentially()
