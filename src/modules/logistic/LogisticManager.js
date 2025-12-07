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
    
    // Calcula Bounding Box (Caixa de Colisão)
    // Usamos Math.floor/ceil para garantir que pegamos o bloco inteiro
    const minX = Math.floor(loc.x)
    const maxX = Math.floor(loc.x + (loc.width || 1))
    const minZ = Math.floor(loc.z)
    const maxZ = Math.floor(loc.z + (loc.depth || 1))
    const minY = Math.floor(loc.y - 1)
    const maxY = Math.floor(loc.y + 2)

    // LOG DE DEBUG (Remova depois que funcionar)
    this.logger?.(`[Debug] Buscando baús na área: X[${minX} a ${maxX}] Y[${minY} a ${maxY}] Z[${minZ} a ${maxZ}]`)

    // IDs de contêineres válidos
    const chestIds = [
      bot.registry.blocksByName["chest"]?.id,
      bot.registry.blocksByName["barrel"]?.id,
      bot.registry.blocksByName["trapped_chest"]?.id,
    ].filter(Boolean)

    // Busca TODOS os baús num raio de 32 blocos (reduzi de 64 pra economizar CPU)
    const allChestsPositions = bot.findBlocks({
      matching: chestIds,
      maxDistance: 32,
      count: 50, // Limite para não processar baús demais
    })

    // Filtra apenas os que estão DENTRO da zona
    const chestsInZone = allChestsPositions.filter(pos => {
        // Verifica se a posição do bloco está dentro dos limites
        const insideX = pos.x >= minX && pos.x < maxX // Usei < maxX para comportamento padrão de largura
        const insideY = pos.y >= minY && pos.y <= maxY
        const insideZ = pos.z >= minZ && pos.z < maxZ 

        if (!insideX || !insideZ || !insideY) {
            // Se estiver muito perto, avisa no log para ajustarmos o JSON
           // const dist = bot.entity.position.distanceTo(pos)
           // if (dist < 5) this.logger?.(`[Debug] Baú ignorado em (${pos.x}, ${pos.y}, ${pos.z}). Fora da zona!`)
            return false
        }
        return true
    })

    // Ordena pelo mais próximo
    return chestsInZone
      .map(pos => bot.blockAt(pos))
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  }
}