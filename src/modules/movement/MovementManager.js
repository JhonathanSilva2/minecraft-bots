import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals, Movements } = pf
const { GoalBlock, GoalNear, GoalFollow } = goals

export default class MovementManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
  }

  // ======================================================
  // NAVEGAÇÃO
  // ======================================================

  async gotoLocation(name) {
    const { bot, logger } = this
    const targetName = (name || "").toLowerCase()

    try {
      const location = await bot.locations.get(targetName)
      if (!location) {
        bot.chat(`Local '${targetName}' não encontrado.`)
        return
      }

      const movements = this.createSmartMovement(bot, { canDig: true })
      bot.pathfinder.setMovements(movements)

      const goal = new GoalBlock(location.x, location.y, location.z)
      logger?.(`[Movement] Indo para ${targetName} (${location.x}, ${location.y}, ${location.z})`)

      await bot.pathfinder.goto(goal)
      bot.chat(`Cheguei em '${targetName}'.`)

    } catch (err) {
      logger?.(`[Movement] Erro ao ir para ${targetName}: ${err.message}`)
      bot.chat(`Não consegui ir para ${targetName}.`)
    }
  }

  async followEntity(targetEntity, range = 2) {
    if (!targetEntity) return
    const movements = this.createSmartMovement(this.bot, { canDig: false })
    this.bot.pathfinder.setMovements(movements)
    const goal = new GoalFollow(targetEntity, range)
    this.bot.pathfinder.setGoal(goal, true)
  }

  stop() {
    this.bot.pathfinder.setGoal(null)
    this.bot.clearControlStates()
  }

  /**
   * Vai até a frente de um bloco específico (interação)
   */
  async goToBlock(block) {
    const movements = this.createSmartMovement(this.bot, { canDig: false })
    this.bot.pathfinder.setMovements(movements)
    await this.bot.pathfinder.goto(
      new GoalNear(block.position.x, block.position.y, block.position.z, 1.5)
    )
  }

  // ======================================================
  // CONFIGURAÇÃO
  // ======================================================

  createSmartMovement(bot, options = {}) {
    const movements = new Movements(bot)
    movements.canDig = options.canDig ?? true
    movements.allowParkour = options.allowParkour ?? true
    movements.allowFreeMotion = true
    movements.allowSprinting = true
    this.setupSimpleAntiStuck(bot)
    return movements
  }

  setupSimpleAntiStuck(bot) {
    let lastPos = bot.entity.position.clone()
    let lastMove = Date.now()
    let attempts = 0

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

      if (idle > 5000) {
        attempts++
        await this.microNudge(bot)
        if (attempts >= 3) {
          bot.pathfinder.setGoal(goal, true)
          attempts = 0
        }
        lastMove = Date.now()
      }
    })
  }

  async microNudge(bot) {
    const nudges = [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
    const n = nudges[Math.floor(Math.random() * nudges.length)]
    bot.lookAt(bot.entity.position.plus(n))
    bot.setControlState("jump", true)
    await bot.waitForTicks(6)
    bot.setControlState("jump", false)
  }
}