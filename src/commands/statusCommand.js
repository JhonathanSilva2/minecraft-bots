const HEART = "\u2764\uFE0F"
const FOOD = "\uD83E\uDD57"

export default function statusCommand(bot, logger) {
  const name = bot.username
  const { health, food } = bot

  const hasVitals =
    typeof health === "number" &&
    !Number.isNaN(health) &&
    typeof food === "number" &&
    !Number.isNaN(food)

  if (!hasVitals) {
    bot.chat(`[${name}] Ainda carregando informa\u00e7\u00f5es de status...`)
    logger?.(`[status] ${name} sem dados de vida/comida ainda`)
    return
  }

  const healthMax = 20
  const foodMax = 20
  const statusMessage = `[${name}] ${HEART} Vida: ${health}/${healthMax} | ${FOOD} Fome: ${food}/${foodMax}`

  bot.chat(statusMessage)
  logger?.(`[status] ${statusMessage}`)
}
