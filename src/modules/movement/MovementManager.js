import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals } = pf
const { Movements } = pf
const { GoalBlock } = goals

class MovementManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
  }

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

      const movements = this.createSmartMovement(bot, logger)
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

    bot.pathfinder.setMovements(movements)
    this.setupSimpleAntiStuck(bot)

    return movements
  }

  setupSimpleAntiStuck(bot) {
    let lastPos = bot.entity.position.clone()
    let lastMove = Date.now()
    let attempts = 0

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

  async storeItemsInZone(zoneName, itemFilter) {
    const bot = this.bot
    const logger = this.logger

    // 1. carregar zona
    const zone = await bot.locations.get(zoneName)
    if (!zone) {
      logger?.(`[storage] zona '${zoneName}' não encontrada`)
      return false
    }

    // 2. AQUI: USANDO O MÉTODO findChestsInZone COMO VOCÊ PEDIU
    const chests = this.findChestsInZone(zone)
    if (!chests.length) {
      logger?.(`[storage] nenhum baú encontrado na zona '${zoneName}'`)
      return false
    }

    // 3. baú mais próximo
    const chestBlock = chests[0]

    // 4. mover até o baú
    try {
      await bot.pathfinder.goto(
        new goals.GoalNear(
          chestBlock.position.x,
          chestBlock.position.y,
          chestBlock.position.z,
          1
        )
      )
    } catch (err) {
      logger?.(`[storage] não consegui chegar no baú: ${err.message}`)
      return false
    }

    // 5. abrir o baú
    let chest
    try {
      chest = await bot.openChest(chestBlock)
    } catch (err) {
      logger?.(`[storage] não consegui abrir o baú: ${err.message}`)
      return false
    }

    // 6. filtrar itens
    const items = bot.inventory.items().filter(itemFilter)
    if (!items.length) {
      chest.close()
      return true
    }

    // 7. depositar
    for (const item of items) {
      try {
        await chest.deposit(item.type, null, item.count)
      } catch (err) {
        logger?.(`[storage] erro ao depositar ${item.name}: ${err.message}`)
      }
    }

    chest.close()
    logger?.(`[storage] itens armazenados com sucesso em '${zoneName}'`)

    return true
  }

  // Converte a zona (x, y, z, width, depth) em uma lista de blocos de baú
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
