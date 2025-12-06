import { Vec3 } from "vec3"
import { getLocation } from "../storage/locationManager.js"
import { loadRecipes } from "./receipesLoader.js"
import pf from "mineflayer-pathfinder"
const { GoalNear } = pf.goals
export const craftingBasic = {
  // ======================================================
  // FUNÇÃO PRINCIPAL DE CRAFT
  // ======================================================
  async craft(bot, itemName, logger) {
    const recipes = await loadRecipes()
    const recipe = recipes[itemName]

    if (!recipe) {
      logger?.(`[craft-basic] receita não existe: ${itemName}`)
      return false
    }

    logger?.(`[craft-basic] craftando ${itemName}...`)

    // 1) Verificar materiais
    let check = await this._checkMaterials(bot, recipe, logger)

    if (!check.ok) {
      logger?.(
        `[craft-basic] faltam materiais: ${JSON.stringify(check.missing)}`
      )

      const canFix = await this._autoCraftMissing(bot, check.missing, logger)
      if (!canFix) return false

      // Rechecagem após gerar ingredientes
      check = await this._checkMaterials(bot, recipe, logger)
      if (!check.ok) {
        logger?.("[craft-basic] ainda faltam materiais.")
        return false
      }
    }

    // 2) Mesa de trabalho
    if (recipe.requiresTable) {
      const table = await this._openWorkbench(bot, logger)
      if (!table) return false

      const ok = await this._craftInTable(bot, table, recipe, logger)
      table.close()
      return ok
    }

    // 3) Craft 2x2
    return await this._craftInInventory(bot, recipe, logger)
  },

  // ======================================================
  // AUTO PRODUÇÃO DE ITENS FALTANTES
  // ======================================================
  async _autoCraftMissing(bot, missing, logger) {
    for (const mat in missing) {
      const qty = missing[mat]
      logger?.(`[craft-basic] tentando produzir ${qty}x ${mat}...`)

      // --------------------------
      // 1) PLANKS → gerar planks do tipo correto
      // --------------------------
      if (mat.endsWith("_planks")) {
        const logEntry = bot.inventory
          .items()
          .find((i) => i.name.endsWith("_log"))

        if (!logEntry) {
          logger?.(
            "[craft-basic] não tenho logs para gerar planks → cortar árvore"
          )
          return false
        }

        const woodType = logEntry.name.replace("_log", "")
        const plankItem = woodType + "_planks"

        logger?.(
          `[craft-basic] detectado tipo de madeira: ${woodType} → crafting ${plankItem}`
        )

        const logsNeeded = Math.ceil(qty / 4)
        if (logEntry.count < logsNeeded) {
          logger?.(
            `[craft-basic] preciso de ${logsNeeded} logs, tenho ${logEntry.count} → cortar árvore`
          )
          return false
        }

        for (let i = 0; i < logsNeeded; i++) {
          const ok = await this.craft(bot, plankItem, logger)
          if (!ok) return false
        }

        continue
      }

      // --------------------------
      // 2) STICK → craftar stick usando "planks" genérico
      // --------------------------
      if (mat === "stick") {
        const ok = await this.craft(bot, "stick", logger)
        if (!ok) return false
        continue
      }

      logger?.(`[craft-basic] sem lógica para gerar: ${mat}`)
      return false
    }

    return true
  },

  // ======================================================
  // RESOLVER MATERIAL (planks genérico → plank real)
  // ======================================================
  _resolveMaterial(bot, mat) {
    if (mat === "planks") {
      const plankItem = bot.inventory
        .items()
        .find((i) => i.name.endsWith("_planks"))
      if (!plankItem) return null
      return plankItem.name
    }

    return mat
  },

  // ======================================================
  // VERIFICAR MATERIAIS
  // ======================================================
  async _checkMaterials(bot, recipe, logger) {
    const mcData = bot.mcData
    const missing = {}
    const required = {}

    for (let row of recipe.shape) {
      for (let cell of row) {
        if (!cell) continue

        const resolved = this._resolveMaterial(bot, cell)
        if (!resolved) continue

        required[resolved] = (required[resolved] || 0) + 1
      }
    }

    for (let mat in required) {
      const needed = required[mat]
      const id = mcData.itemsByName[mat]?.id

      if (!id) {
        missing[mat] = needed
        continue
      }

      const has = bot.inventory.count(id)
      if (has < needed) {
        missing[mat] = needed - has
      }
    }

    return { ok: Object.keys(missing).length === 0, missing }
  },

  // ======================================================
  // ABRIR MESA
  // ======================================================
  async _openWorkbench(bot, logger) {
    const work = await getLocation("workbench")

    if (!work) {
      logger?.("[craft-basic] workbench não registrada")
      return null
    }

    const pos = new Vec3(work.x, work.y, work.z)
    const block = bot.blockAt(pos)

    if (!block || block.name !== "crafting_table") {
      logger?.("[craft-basic] bloco da mesa sumiu")
      return null
    }

    // mover corretamente até a mesa
    try {
      await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1))
    } catch (err) {
      logger?.("[craft-basic] erro ao chegar na mesa: " + err.message)
      return null
    }

    // abrir GUI
    try {
      return await bot.openBlock(block)
    } catch (err) {
      logger?.("[craft-basic] erro ao abrir mesa: " + err.message)
      return null
    }
  },

  // ======================================================
  // CRAFT 2x2
  // ======================================================
  async _craftInInventory(bot, recipe, logger) {
    try {
      logger?.("[craft-basic] craft 2x2...")

      const mcData = bot.mcData
      const output = Object.keys(recipe.outputs)[0]
      const id = mcData.itemsByName[output]?.id

      const real = bot.recipesFor(id)
      if (!real.length) {
        logger?.("[craft-basic] receita 2x2 não existe no Minecraft")
        return false
      }

      await bot.craft(real[0], 1, null)
      logger?.(`[craft-basic] craft ok: ${output}`)
      return true
    } catch (err) {
      logger?.("[craft-basic] erro 2x2: " + err.message)
      return false
    }
  },

  // ======================================================
  // CRAFT 3x3 MANUAL
  // ======================================================
  async _craftInTable(bot, tableWindow, recipe, logger) {
    try {
      logger?.("[craft-basic] craft 3x3...")

      const mcData = bot.mcData
      const slots = tableWindow.slots

      // Limpar grade
      for (let i = 1; i <= 9; i++) {
        if (slots[i]) await bot.clickWindow(i, 0, 0)
      }

      // Preencher grade
      for (let r = 0; r < recipe.shape.length; r++) {
        for (let c = 0; c < recipe.shape[r].length; c++) {
          const item = recipe.shape[r][c]
          if (!item) continue

          const resolved = this._resolveMaterial(bot, item)
          if (!resolved) continue

          const id = mcData.itemsByName[resolved]?.id
          const invSlot = bot.inventory.findInventoryItem(id)
          if (!invSlot) continue

          const targetSlot = 1 + r * 3 + c
          await bot.moveSlotItem(invSlot.slot, targetSlot)
        }
      }

      // Pegar resultado
      await bot.clickWindow(0, 0, 0)
      logger?.("[craft-basic] craft 3x3 completo!")

      return true
    } catch (err) {
      logger?.("[craft-basic] erro craft 3x3: " + err.message)
      return false
    }
  },
}
