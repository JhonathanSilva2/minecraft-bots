import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { Movements } = pf

export function createSmartMovement(bot) {
  const movements = new Movements(bot)

  movements.canDig = true
  movements.allowParkour = true
  movements.allowFreeMotion = true
  movements.allowSprinting = true

  bot.pathfinder.setMovements(movements)
  setupSimpleAntiStuck(bot)

  return movements
}

function setupSimpleAntiStuck(bot) {
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
      await microNudge(bot)

      // 3 tentativas → reset total
      if (attempts >= 3) {
        bot.pathfinder.setGoal(goal, true)
        attempts = 0
      }

      lastMove = Date.now()
    }
  })
}

async function microNudge(bot) {
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
