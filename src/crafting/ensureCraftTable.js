import { Vec3 } from "vec3"
import pf from "mineflayer-pathfinder"
import { getLocation } from "../storage/locationManager.js"

const { goals } = pf
const { GoalBlock } = goals

/**
 * Garante que exista uma crafting table na base.
 * Se já existir, retorna o bloco.
 * Se não existir, tenta colocar uma existente do inventário.
 */
export async function ensureCraftTable(bot, logger) {
  const base = await getLocation("base")
  if (!base) {
    logger?.("[craft] nenhuma área 'base' definida.")
    return null
  }

  const { x: cx, y, z: cz, width, depth } = base
  const halfW = Math.floor(width / 2)
  const halfD = Math.floor(depth / 2)

  const minX = cx - halfW
  const maxX = cx + halfW
  const minZ = cz - halfD
  const maxZ = cz + halfD

  // 1) procurar uma crafting table já colocada na base
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const block = bot.blockAt(new Vec3(x, y, z))
      if (block && block.name === "crafting_table") {
        return block
      }
    }
  }

  // 2) tentar colocar uma crafting_table do inventário
  const tableItem = bot.inventory.items().find((i) => i.name === "crafting_table")

  if (!tableItem) {
    logger?.("[craft] bot não possui crafting_table no inventário.")
    return null
  }

  // escolher um ponto simples: centro exato da base
  const targetX = cx
  const targetY = y
  const targetZ = cz
  const anchorPos = new Vec3(targetX, targetY - 1, targetZ)

  const anchor = bot.blockAt(anchorPos)
  const here = bot.blockAt(new Vec3(targetX, targetY, targetZ))

  if (!anchor || anchor.boundingBox !== "block" || !here || here.name !== "air") {
    logger?.(
      "[craft] posição central da base não é adequada para colocar crafting_table."
    )
    return null
  }

  try {
    const goal = new GoalBlock(targetX, targetY, targetZ)
    await bot.pathfinder.goto(goal)
  } catch {
    // se não conseguir chegar exatamente, tenta colocar assim mesmo
  }

  try {
    await bot.equip(tableItem, "hand")
    await bot.placeBlock(anchor, new Vec3(0, 1, 0))
    const placed = bot.blockAt(new Vec3(targetX, targetY, targetZ))
    logger?.(
      `[craft] crafting_table colocada em (${targetX}, ${targetY}, ${targetZ})`
    )
    return placed
  } catch (err) {
    logger?.(
      `[craft] erro ao colocar crafting_table: ${err?.message ?? err}`
    )
    return null
  }
}
