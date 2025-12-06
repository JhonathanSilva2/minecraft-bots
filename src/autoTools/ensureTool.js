/**
 * Auto-craft de ferramentas usando mineflayer-crafting-util.
 * Faz fallback automático: se não tiver machado, cria tudo.
 */
export async function ensureTool(bot, type, logger) {
  // tipo deve ser "axe", "pickaxe", "shovel", etc
  if (!type) return false

  const woodenName = `wooden_${type}`
  const stoneName = `stone_${type}`

  // Se já tiver a ferramenta, ok
  const has = bot.inventory.items().some((i) => i.name.includes(type))
  if (has) return true

  logger?.(`[tools] tentando craftar ${stoneName} ou ${woodenName}...`)

  // ==========================
  // TENTAR STONE_FIRST
  // ==========================
  try {
    await bot.craftUtil.ensureItem(stoneName, 1)
    logger?.(`[tools] crafted ${stoneName} com sucesso`)
    return true
  } catch (_) {
    logger?.(
      `[tools] não foi possível craftar ${stoneName}, tentando fallback...`
    )
  }

  // ==========================
  // FALLBACK: TENTAR WOODEN
  // ==========================
  try {
    await bot.craftUtil.ensureItem(woodenName, 1)
    logger?.(`[tools] crafted ${woodenName} com sucesso`)
    return true
  } catch (err) {
    logger?.(`[tools] erro ao craftar ${woodenName}: ${err.message}`)
    return false
  }
}
