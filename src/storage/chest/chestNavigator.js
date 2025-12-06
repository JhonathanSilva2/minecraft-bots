import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals } = pf
const { GoalBlock } = goals

export async function goToChest(bot, coords, logger) {
  const { x, y, z } = coords
  const goal = new GoalBlock(x, y, z)

  logger?.(`[chest] ${bot.username} indo até baú em (${x}, ${y}, ${z})`)

  await bot.pathfinder.goto(goal)
}

export async function openChestAt(bot, coords, logger) {
  const { x, y, z } = coords
  const block = bot.blockAt(new Vec3(x, y, z))

  if (!block || !block.name || !block.name.includes("chest")) {
    logger?.(
      `[chest] bloco em (${x}, ${y}, ${z}) não é um baú (encontrei: ${
        block?.name ?? "nada"
      })`
    )
    return null
  }

  try {
    const chest = await bot.openChest(block)
    return chest
  } catch (err) {
    logger?.(
      `[chest] erro ao abrir baú em (${x}, ${y}, ${z}): ${err?.message ?? err}`
    )
    return null
  }
}
