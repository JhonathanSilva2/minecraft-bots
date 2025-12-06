import { Vec3 } from "vec3"
import { getLocation, setLocation } from "../storage/locationManager.js"
import pf from "mineflayer-pathfinder"
const { Movements, goals } = pf
const { GoalNear } = goals
import { craftingBasic } from "./craftingBasic.js"

export const craftingManager = {
  // ======================================================
  // GARANTE FERRAMENTA
  // ======================================================
  async ensureTool(bot, type, logger) {
    const has = bot.inventory.items().some((i) => i.name.includes(type))
    if (has) return true

    logger?.(`[craft] ${bot.username} sem ${type}, craftando...`)

    const workbenchPos = await this.ensureWorkbench(bot, logger)
    if (!workbenchPos) return false

    if (type === "axe") {
      return await this.craftAxe(bot, logger)
    }

    return false
  },

  // ======================================================
  // GARANTE UMA CRAFTING TABLE NA BASE
  // ======================================================
  async ensureWorkbench(bot, logger) {
    const base = await getLocation("workbench")
    if (!base) {
      logger?.("[craft] base não definida!")
      return null
    }

    await this.moveToBase(bot, logger)

    const x = base.x + Math.floor(base.width / 2)
    const y = base.y
    const z = base.z + Math.floor(base.depth / 2)
    const pos = new Vec3(x, y, z)

    // Já existe crafting table?
    const block = bot.blockAt(pos)
    if (block && block.name === "crafting_table") {
      await setLocation("workbench", { x, y, z })
      return { x, y, z }
    }

    logger?.("[craft] criando crafting table...")

    const ok = await this.craftItem(bot, "crafting_table", 1, logger)
    if (!ok) return null

    const placed = await this.placeBlock(bot, "crafting_table", pos, logger)
    if (!placed) return null

    await setLocation("workbench", { x, y, z })
    return { x, y, z }
  },

  // ======================================================
  // IR PARA BASE
  // ======================================================
  async moveToBase(bot, logger) {
    const base = await getLocation("base")
    if (!base) return

    const x = base.x + Math.floor(base.width / 2)
    const y = base.y
    const z = base.z + Math.floor(base.depth / 2)

    const mov = new Movements(bot)
    bot.pathfinder.setMovements(mov)

    const goal = new GoalNear(x, y, z, 1)

    try {
      await bot.pathfinder.goto(goal)
      logger?.(`[craft] movido para base (${x}, ${y}, ${z})`)
    } catch {
      logger?.("[craft] falha ao ir para base")
    }
  },

  // ======================================================
  // CRAFTAR MACHADO
  // ======================================================
  async craftAxe(bot, logger) {
    if (await this.craftItem(bot, "stone_axe", 1, logger)) return true
    if (await this.craftItem(bot, "wooden_axe", 1, logger)) return true

    logger?.("[craft] nenhuma receita de machado encontrada!")
    return false
  },

  // ======================================================
  // SISTEMA DE CRAFT UNIVERSAL
  // ======================================================

  async craftItem(bot, itemName, qty, logger) {
    return await craftingBasic.craft(bot, itemName, logger)
  },

  // ======================================================
  // COLOCAR BLOCO EXATAMENTE NA POSIÇÃO
  // ======================================================
  async placeBlock(bot, blockName, pos, logger) {
    const item = bot.inventory.items().find((i) => i.name === blockName)
    if (!item) {
      logger?.(`[place] não tenho ${blockName} para colocar`)
      return false
    }

    const anchor = bot.blockAt(pos.offset(0, -1, 0))
    if (!anchor) {
      logger?.("[place] sem bloco de apoio para colocar crafting table")
      return false
    }

    try {
      await bot.equip(item, "hand")
      await bot.placeBlock(anchor, new Vec3(0, 1, 0))
      logger?.(
        `[place] colocado ${blockName} em (${pos.x}, ${pos.y}, ${pos.z})`
      )
      return true
    } catch (err) {
      logger?.(`[place] erro ao colocar bloco: ${err.message}`)
      return false
    }
  },
}
