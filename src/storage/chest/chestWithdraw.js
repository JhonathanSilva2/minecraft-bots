import { getChest } from "./chestManager.js"
import { goToChest, openChestAt } from "./chestNavigator.js"

export async function withdrawItemFromChest(bot, itemName, amount, logger) {
  const chestCoords = await getChest(itemName)

  if (!chestCoords) {
    logger?.(
      `[withdraw] não há baú registrado para item ${itemName}`
    )
    bot.chat?.(`Não encontrei baú para ${itemName}.`)
    return false
  }

  try {
    await goToChest(bot, chestCoords, logger)
    const chest = await openChestAt(bot, chestCoords, logger)
    if (!chest) return false

    const itemInfo = bot.registry.itemsByName?.[itemName]
    if (!itemInfo) {
      logger?.(
        `[withdraw] item ${itemName} não existe no registry do bot.`
      )
      await chest.close()
      return false
    }

    try {
      await chest.withdraw(itemInfo.id, null, amount)
      logger?.(
        `[withdraw] retirado ${amount}x ${itemName} do baú em (${chestCoords.x}, ${chestCoords.y}, ${chestCoords.z})`
      )
      bot.chat?.(`Retirei ${amount}x ${itemName} do armazém.`)
    } catch (err) {
      logger?.(
        `[withdraw] erro ao retirar ${itemName}: ${err?.message ?? err}`
      )
      await chest.close()
      return false
    }

    await chest.close()
    return true
  } catch (err) {
    logger?.(
      `[withdraw] erro geral ao retirar ${itemName}: ${err?.message ?? err}`
    )
    return false
  }
}
