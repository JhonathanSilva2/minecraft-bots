// exemplo: src/commands/storageCommands.js
import { storeInventoryForBot } from "../storage/chest/ChestSorter.js"
import { withdrawItemFromChest } from "../storage/chest/chestWithdraw.js"

export async function handleStorageCommand(bot, args, logger) {
  const sub = (args[0] || "").toLowerCase()

  if (sub === "guardar") {
    await storeInventoryForBot(bot, logger)
    return
  }

  if (sub === "pegar") {
    const itemName = args[1]
    const amount = Number(args[2] ?? "1")

    if (!itemName || Number.isNaN(amount)) {
      bot.chat("Uso: !<bot> armazem pegar <item> <quantidade>")
      return
    }

    await withdrawItemFromChest(bot, itemName, amount, logger)
    return
  }

  bot.chat("Uso: !<bot> armazem guardar | !<bot> armazem pegar <item> <qtd>")
}
