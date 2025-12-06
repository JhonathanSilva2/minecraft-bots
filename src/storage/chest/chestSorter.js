import { ensureChestForItem } from "./chestCreator.js"
import { getChest } from "./chestManager.js"
import { goToChest, openChestAt } from "./chestNavigator.js"

export async function storeSingleItem(bot, item, logger) {
  const itemName = item.name
  const itemId = item.type
  const amount = item.count

  let chestCoords = await getChest(itemName)
  if (!chestCoords) {
    chestCoords = await ensureChestForItem(bot, itemName, logger)
  }

  if (!chestCoords) {
    logger?.(
      `[store] não foi possível obter/ criar baú para item ${itemName}`
    )
    return false
  }

  try {
    await goToChest(bot, chestCoords, logger)
    const chest = await openChestAt(bot, chestCoords, logger)
    if (!chest) return false

    try {
      await chest.deposit(itemId, null, amount)
      logger?.(
        `[store] depositado ${amount}x ${itemName} em baú (${chestCoords.x}, ${chestCoords.y}, ${chestCoords.z})`
      )
    } catch (err) {
      logger?.(
        `[store] erro ao depositar ${itemName}: ${err?.message ?? err}`
      )
      await chest.close()
      return false
    }

    await chest.close()
    return true
  } catch (err) {
    logger?.(
      `[store] erro geral ao armazenar ${itemName}: ${err?.message ?? err}`
    )
    return false
  }
}

export async function storeInventoryForBot(bot, logger) {
  const items = bot.inventory.items()
  if (!items.length) {
    logger?.("[store] inventário já está vazio.")
    return
  }

  for (const item of items) {
    if (item.name === "chest") continue
    await storeSingleItem(bot, item, logger)
  }

  logger?.("[store] inventário organizado com sucesso.")
  bot.chat?.("Inventário organizado com sucesso.")
}
