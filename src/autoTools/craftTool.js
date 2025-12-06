import { ensureCraftTable } from "../crafting/ensureCraftTable.js"

/**
 * Por enquanto implementa apenas craft de machado ("axe").
 * Tenta craftar stone_axe se tiver stick + cobblestone.
 */
export async function craftTool(bot, type, logger) {
  if (type !== "axe") {
    logger?.(`[craft] tipo de ferramenta '${type}' ainda não suportado.`)
    return false
  }

  const registry = bot.registry
  const stoneAxe = registry.itemsByName["stone_axe"]
  const cobble = registry.itemsByName["cobblestone"]
  const stick = registry.itemsByName["stick"]

  if (!stoneAxe || !cobble || !stick) {
    logger?.("[craft] itens necessários (stone_axe / cobblestone / stick) não encontrados no registry.")
    return false
  }

  const hasCobble = countItem(bot, "cobblestone")
  const hasStick = countItem(bot, "stick")

  if (hasCobble < 3 || hasStick < 2) {
    logger?.(
      `[craft] materiais insuficientes para stone_axe (tem ${hasCobble} cobble, ${hasStick} sticks)`
    )
    return false
  }

  const tableBlock = await ensureCraftTable(bot, logger)

  try {
    const recipes = bot.recipesFor(stoneAxe.id, null, tableBlock)
    if (!recipes || recipes.length === 0) {
      logger?.("[craft] nenhuma receita encontrada para stone_axe.")
      return false
    }

    const recipe = recipes[0]
    logger?.("[craft] craftando stone_axe...")
    await bot.craft(recipe, 1, tableBlock)
    return true
  } catch (err) {
    logger?.(`[craft] erro ao craftar stone_axe: ${err?.message ?? err}`)
    return false
  }
}

function countItem(bot, itemName) {
  return bot.inventory
    .items()
    .filter((i) => i.name === itemName)
    .reduce((sum, i) => sum + i.count, 0)
}
