import pf from "mineflayer-pathfinder"
import { getLocation } from "../storage/locationManager.js"
import { createSmartMovement } from "../modules/smartMovement/index.js"

const { Movements, goals } = pf
const { GoalBlock } = goals

export async function gotoLocation(bot, name, logger) {
  const targetName = (name || "").toLowerCase()
  if (!targetName) {
    bot.chat("Uso: !<bot> ir <local>")
    return
  }

  try {
    const location = await getLocation(targetName)

    if (!location) {
      bot.chat(`Local '${targetName}' n\u00e3o encontrado.`)
      return
    }
    // (ajuste o path conforme tua estrutura)

    const movements = createSmartMovement(bot, logger)
    bot.pathfinder.setMovements(movements)

    const goal = new GoalBlock(location.x, location.y, location.z)
    logger?.(
      `[goto] indo para ${targetName} em (${location.x}, ${location.y}, ${location.z})`
    )
    await bot.pathfinder.goto(goal)
    bot.chat(`Cheguei no local '${targetName}'.`)
  } catch (err) {
    logger?.(`[goto] erro ao ir para ${targetName}: ${err?.message ?? err}`)
    bot.chat(`N\u00e3o consegui ir para ${targetName} agora.`)
  }
}
