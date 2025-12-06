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
}
export default MovementManager
