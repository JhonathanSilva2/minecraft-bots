import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals } = pf
const { Movements } = pf
const { GoalBlock, GoalNear } = goals

class MovementManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
  }

  // ======================================================
  // NAVEGAÇÃO BÁSICA
  // ======================================================

  async gotoLocation(name) {
    const bot = this.bot
    const logger = this.logger

    const targetName = (name || "").toLowerCase()
    if (!targetName) {
      bot.chat("Uso: !<bot> ir <local>")
      return
    }

    try {
      const location = await bot.locations.get(targetName)

      if (!location) {
        bot.chat(`Local '${targetName}' não encontrado.`)
        return
      }

      const movements = this.createSmartMovement(bot)
      bot.pathfinder.setMovements(movements)

      const goal = new GoalBlock(location.x, location.y, location.z)
      logger?.(
        `[goto] indo para ${targetName} em (${location.x}, ${location.y}, ${location.z})`
      )

      await bot.pathfinder.goto(goal)
      bot.chat(`Cheguei no local '${targetName}'.`)
    } catch (err) {
      console.log(err)
      logger?.(`[goto] erro ao ir para ${targetName}: ${err?.message ?? err}`)
      bot.chat(`Não consegui ir para ${targetName} agora.`)
    }
  }

  createSmartMovement(bot) {
    const movements = new Movements(bot)

    movements.canDig = true
    movements.allowParkour = true
    movements.allowFreeMotion = true
    movements.allowSprinting = true

    // Configurações extras para evitar que ele quebre baús ou crafting tables
    // movements.blocksToAvoid.add(bot.registry.blocksByName['chest'].id) 
    // movements.blocksToAvoid.add(bot.registry.blocksByName['crafting_table'].id)

    bot.pathfinder.setMovements(movements)
    this.setupSimpleAntiStuck(bot)

    return movements
  }

  setupSimpleAntiStuck(bot) {
    let lastPos = bot.entity.position.clone()
    let lastMove = Date.now()
    let attempts = 0

    // Remove listeners antigos para evitar duplicidade se chamar createSmartMovement 2x
    bot.removeAllListeners('physicsTick')

    bot.on("physicsTick", async () => {
      const current = bot.entity.position
      const moved = current.distanceTo(lastPos)

      if (moved > 0.05) {
        lastPos = current.clone()
        lastMove = Date.now()
        attempts = 0
        return
      }

      const idle = Date.now() - lastMove
      const goal = bot.pathfinder.goal
      if (!goal) return

      // 5 segundos parado = tenta nudger
      if (idle > 5000) {
        attempts++

        // micro movimento simples
        await this.microNudge(bot)

        // 3 tentativas → reset total
        if (attempts >= 3) {
          bot.pathfinder.setGoal(goal, true)
          attempts = 0
        }

        lastMove = Date.now()
      }
    })
  }

  async microNudge(bot) {
    const nudges = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ]

    const n = nudges[Math.floor(Math.random() * nudges.length)]

    bot.lookAt(bot.entity.position.plus(n))
    bot.setControlState("jump", true)
    await bot.waitForTicks(6)
    bot.setControlState("jump", false)
  }

  // ======================================================
  // SISTEMA DE LOGÍSTICA (BAÚS)
  // ======================================================

  /**
   * Guarda itens em uma zona específica.
   * @param {string} zoneName - Nome do local no locations.json
   * @param {function} itemFilter - Função (item) => boolean para decidir o que guardar
   */
  async storeItemsInZone(zoneName, itemFilter) {
    const bot = this.bot
    const logger = this.logger

    const zone = await bot.locations.get(zoneName)
    if (!zone) {
      logger?.(`[storage] zona '${zoneName}' não encontrada`)
      return false
    }

    const chests = this.findChestsInZone(zone)
    if (!chests.length) {
      logger?.(`[storage] nenhum baú encontrado na zona '${zoneName}'`)
      return false
    }

    // Tenta guardar nos baús, um por um, até esvaziar o inventário
    for (const chestBlock of chests) {
        // Verifica se ainda temos itens para guardar antes de ir ao próximo baú
        const itemsToDeposit = bot.inventory.items().filter(itemFilter)
        if (itemsToDeposit.length === 0) break

        try {
            await this.goToBlock(chestBlock)
            const chest = await bot.openChest(chestBlock)
            
            for (const item of itemsToDeposit) {
                try {
                    await chest.deposit(item.type, null, item.count)
                } catch (err) {
                    // Baú cheio ou erro específico, continua para o próximo item/baú
                }
            }
            chest.close()
        } catch (err) {
            logger?.(`[storage] Erro ao acessar baú: ${err.message}`)
        }
    }

    const remaining = bot.inventory.items().filter(itemFilter)
    if (remaining.length > 0) {
        logger?.(`[storage] Aviso: Não coube tudo nos baús. Restam ${remaining.length} stacks.`)
        return false
    }
    
    logger?.(`[storage] Itens armazenados com sucesso em '${zoneName}'`)
    return true
  }

  /**
   * Busca itens em uma zona baseada em requisitos do CraftManager.
   * @param {string} zoneName - Nome da zona
   * @param {Array} requirements - [{ ids: [1, 2], count: 10 }, ...]
   */
  async retrieveItemsFromZone(zoneName, requirements) {
      const bot = this.bot
      const logger = this.logger

      // 1. Prepara controle de faltantes (Deep Copy para não alterar o original da referência)
      // O objetivo é zerar os 'count' dessa lista
      const missing = JSON.parse(JSON.stringify(requirements))

      const zone = await bot.locations.get(zoneName)
      if (!zone) {
          logger?.(`[logistics] Zona '${zoneName}' não encontrada.`)
          return false
      }

      const chests = this.findChestsInZone(zone)
      if (!chests.length) {
          logger?.(`[logistics] Nenhum baú em '${zoneName}'.`)
          return false
      }

      logger?.(`[logistics] Procurando recursos em ${chests.length} baús...`)

      for (const chestBlock of chests) {
          // Se já pegamos tudo, para de abrir baús
          if (missing.length === 0) break

          try {
              await this.goToBlock(chestBlock)
              const window = await bot.openContainer(chestBlock)
              const containerItems = window.containerItems()

              // Itera sobre os requisitos que ainda faltam
              for (let i = 0; i < missing.length; i++) {
                  const req = missing[i]
                  
                  // Procura no baú um item que bata com um dos IDs necessários
                  const itemInChest = containerItems.find(item => req.ids.includes(item.type))

                  if (itemInChest) {
                      const qtyToWithdraw = Math.min(itemInChest.count, req.count)
                      
                      try {
                          await window.withdraw(itemInChest.type, null, qtyToWithdraw)
                          
                          // Atualiza quanto falta
                          req.count -= qtyToWithdraw
                          logger?.(`[logistics] Peguei ${qtyToWithdraw}x (ID: ${itemInChest.type}). Falta: ${req.count}`)
                      } catch (err) {
                          logger?.(`[logistics] Falha ao sacar item: ${err.message}`)
                      }
                  }
              }

              window.close()
              
              // Remove requisitos cumpridos (count <= 0) da lista 'missing'
              // Filtramos o array in-place ou reatribuimos
              const pending = missing.filter(req => req.count > 0)
              missing.length = 0
              missing.push(...pending)

          } catch (err) {
              logger?.(`[logistics] Erro ao abrir baú: ${err.message}`)
          }
      }

      if (missing.length > 0) {
          logger?.(`[logistics] Não encontrei todos os itens. Faltam requisitos.`)
          return false
      }

      logger?.(`[logistics] Todos os recursos coletados com sucesso!`)
      return true
  }

  // ======================================================
  // UTILITÁRIOS
  // ======================================================

  // Helper para ir até um bloco (baú, mesa, etc)
  async goToBlock(block) {
      // 1.41 é raiz de 2 (diagonal), bom alcance
      await this.bot.pathfinder.goto(
          new GoalNear(block.position.x, block.position.y, block.position.z, 1.5)
      )
  }

  findChestsInZone(loc) {
    const bot = this.bot

    const minX = loc.x
    const maxX = loc.x + (loc.width || 1)
    const minZ = loc.z
    const maxZ = loc.z + (loc.depth || 1)
    const minY = loc.y - 1
    const maxY = loc.y + 2

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
      .map((pos) => bot.blockAt(pos))
      .filter((block) => {
        const p = block.position
        return (
          p.x >= minX &&
          p.x <= maxX &&
          p.z >= minZ &&
          p.z <= maxZ &&
          p.y >= minY &&
          p.y <= maxY
        )
      })
      .sort(
        (a, b) =>
          bot.entity.position.distanceTo(a.position) -
          bot.entity.position.distanceTo(b.position)
      )
  }
}
export default MovementManager