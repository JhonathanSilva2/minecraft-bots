import { Vec3 } from "vec3"
import pf from "mineflayer-pathfinder"
import { getLocation } from "../locationManager.js"
import { getChest, setChest, loadChests } from "./chestManager.js"

const { goals } = pf
const { GoalBlock } = goals

/**
 * Garante que exista um baú para o item informado dentro da área do armazém.
 * Se já existir, apenas retorna as coordenadas atuais.
 * Se não existir, tenta criar um novo baú usando um item "chest" do inventário.
 */
export async function ensureChestForItem(bot, itemName, logger) {
  const existing = await getChest(itemName)
  if (existing) return existing

  const armazem = await getLocation("armazem")
  if (!armazem) {
    logger?.("[armazem] Nenhuma área de armazém definida.")
    return null
  }

  const { x: cx, y, z: cz, width, depth } = armazem
  const halfW = Math.floor(width / 2)
  const halfD = Math.floor(depth / 2)

  const minX = cx - halfW
  const maxX = cx + halfW
  const minZ = cz - halfD
  const maxZ = cz + halfD

  const allChests = await loadChests()
  const usedCoords = new Set(
    Object.values(allChests).map((c) => `${c.x}|${c.y}|${c.z}`)
  )

  const chestItem = bot.inventory.items().find((i) => i.name === "chest")
  if (!chestItem) {
    logger?.("[armazem] bot não tem baús no inventário para colocar.")
    return null
  }

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const key = `${x}|${y}|${z}`
      if (usedCoords.has(key)) continue

      const below = bot.blockAt(new Vec3(x, y - 1, z))
      const here = bot.blockAt(new Vec3(x, y, z))
      const above = bot.blockAt(new Vec3(x, y + 1, z))

      const canPlace =
        below &&
        below.boundingBox === "block" &&
        here &&
        here.name === "air" &&
        above &&
        above.name === "air"

      if (!canPlace) continue

      logger?.(
        `[armazem] slot livre encontrado para ${itemName} em (${x}, ${y}, ${z})`
      )

      try {
        const goal = new GoalBlock(x, y, z)
        await bot.pathfinder.goto(goal)
      } catch {
        // se não conseguir chegar exatamente, ainda tenta colocar
      }

      const anchor = bot.blockAt(new Vec3(x, y - 1, z))
      if (!anchor || anchor.boundingBox !== "block") continue

      try {
        await bot.equip(chestItem, "hand")
        await bot.placeBlock(anchor, new Vec3(0, 1, 0))

        const coords = { x, y, z }
        await setChest(itemName, coords)

        logger?.(
          `[armazem] baú criado para ${itemName} em (${x}, ${y}, ${z})`
        )

        return coords
      } catch (err) {
        logger?.(
          `[armazem] erro ao colocar baú para ${itemName} em (${x}, ${y}, ${z}): ${
            err?.message ?? err
          }`
        )
        continue
      }
    }
  }

  logger?.("[armazem] não há espaço disponível para novos baús.")
  return null
}
