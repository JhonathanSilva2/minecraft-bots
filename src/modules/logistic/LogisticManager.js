export default class LogisticsManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
  }

  // ======================================================
  // GERENCIAMENTO DE ESTOQUE (ZONAS)
  // ======================================================

  /**
   * Guarda itens em uma zona específica.
   * @param {string} zoneName - Nome da zona (ex: "armazem")
   * @param {function} itemFilter - Função (item) => boolean (O que guardar?)
   */
  async storeItemsInZone(zoneName, itemFilter) {
    const { bot, logger } = this

    // 1. Valida Zona
    const zone = await bot.locations.get(zoneName)
    if (!zone) {
      logger?.(`[Logistics] Zona '${zoneName}' não encontrada.`)
      return false
    }

    // 2. Acha Baús
    const chests = this.findChestsInZone(zone)
    if (!chests.length) {
      logger?.(`[Logistics] Nenhum baú em '${zoneName}'.`)
      return false
    }

    // 3. Ciclo de Depósito
    for (const chestBlock of chests) {
      // Recalcula o que precisa ser guardado a cada baú
      const itemsToDeposit = bot.inventory.items().filter(itemFilter)
      if (itemsToDeposit.length === 0) break

      try {
        // Usa o MovementManager para ir até o bloco
        await bot.movement.goToBlock(chestBlock)
        
        const chest = await bot.openContainer(chestBlock)
        
        for (const item of itemsToDeposit) {
          try {
            await chest.deposit(item.type, null, item.count)
          } catch (err) {
            // Ignora erro se baú estiver cheio e tenta o próximo item
          }
        }
        chest.close()
      } catch (err) {
        logger?.(`[Logistics] Erro no baú: ${err.message}`)
      }
    }

    // Verifica sucesso
    const remaining = bot.inventory.items().filter(itemFilter)
    return remaining.length === 0
  }

  /**
   * Busca itens em uma zona (usado por Crafter/Miner).
   * @param {string} zoneName 
   * @param {Array} requirements - [{ ids: [1, 2], count: 10 }, ...]
   */
  async retrieveItemsFromZone(zoneName, requirements) {
    const { bot, logger } = this
    const missing = JSON.parse(JSON.stringify(requirements)) // Cópia segura

    const zone = await bot.locations.get(zoneName)
    if (!zone) return false

    const chests = this.findChestsInZone(zone)
    if (!chests.length) return false

    for (const chestBlock of chests) {
      if (missing.length === 0) break

      try {
        await bot.movement.goToBlock(chestBlock)
        const window = await bot.openContainer(chestBlock)
        const containerItems = window.containerItems()

        // Itera sobre o que falta
        for (const req of missing) {
          const itemInChest = containerItems.find(item => req.ids.includes(item.type))

          if (itemInChest) {
            const qtyToWithdraw = Math.min(itemInChest.count, req.count)
            try {
              await window.withdraw(itemInChest.type, null, qtyToWithdraw)
              req.count -= qtyToWithdraw
              logger?.(`[Logistics] Peguei ${qtyToWithdraw}x (ID: ${itemInChest.type}). Falta: ${req.count}`)
            } catch (err) {
                logger?.(`[Logistics] Erro ao sacar: ${err.message}`)
            }
          }
        }
        window.close()

        // Remove requisitos cumpridos
        for (let i = missing.length - 1; i >= 0; i--) {
            if (missing[i].count <= 0) missing.splice(i, 1)
        }

      } catch (err) {
        logger?.(`[Logistics] Erro ao abrir baú: ${err.message}`)
      }
    }

    return missing.length === 0
  }

  // ======================================================
  // UTILITÁRIOS
  // ======================================================

  /**
   * Equipa a melhor ferramenta disponível para um bloco ou propósito.
   * @param {string} toolType - 'pickaxe', 'sword', 'axe', 'shovel'
   */
  async equipBestTool(toolType) {
      const items = this.bot.inventory.items()
      // Filtra itens que contenham o nome (ex: "diamond_pickaxe")
      const tools = items.filter(i => i.name.includes(toolType))
      
      // Ordena por material (Lógica simples: Netherite > Diamond > Iron > Stone > Wood)
      // Pode ser melhorado com uma lista de prioridade real
      const materialOrder = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden']
      
      tools.sort((a, b) => {
          const aMat = materialOrder.findIndex(m => a.name.startsWith(m))
          const bMat = materialOrder.findIndex(m => b.name.startsWith(m))
          // findIndex retorna -1 se não achar, então cuidado. 
          // Mas como filtramos por toolType, geralmente funciona.
          return aMat - bMat 
      })

      if (tools.length > 0) {
          try {
            await this.bot.equip(tools[0], 'hand')
            return true
          } catch(e) { return false }
      }
      return false
  }

  findChestsInZone(loc) {
    const bot = this.bot
    const minX = loc.x, maxX = loc.x + (loc.width || 1)
    const minZ = loc.z, maxZ = loc.z + (loc.depth || 1)
    const minY = loc.y - 1, maxY = loc.y + 2

    const allChests = bot.findBlocks({
      matching: [
        bot.registry.blocksByName["chest"]?.id,
        bot.registry.blocksByName["barrel"]?.id,
        bot.registry.blocksByName["trapped_chest"]?.id,
      ].filter(Boolean),
      maxDistance: 64,
      count: 200,
    })

    return allChests
      .map(pos => bot.blockAt(pos))
      .filter(block => {
        const p = block.position
        return p.x >= minX && p.x <= maxX &&
               p.z >= minZ && p.z <= maxZ &&
               p.y >= minY && p.y <= maxY
      })
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  }
}