import { startBot } from "./core/bot.js"
import { getBotNames } from "./utils/getBotName.js"

const botNames = getBotNames()

console.log("Iniciando bots:", botNames.join(", "))

async function startBotsSequentially() {
  for (const name of botNames) {
    console.log(`Iniciando bot ${name}...`)
    startBot(name)

    // Aguarda 1 segundo para evitar ECONNRESET
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

startBotsSequentially()
