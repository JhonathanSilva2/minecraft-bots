import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { Movements, goals } = pf
const { GoalNear } = goals

// Tipos de madeira
const TREE_TYPES = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "jungle_log",
  "acacia_log",
  "dark_oak_log",
  "cherry_log",
  "mangrove_log",
]

export function createWoodcutter(bot, logger) {
  let enabled = false
  let running = false

  bot.on("physicsTick", () => {
    if (!enabled || running) return
    running = true
    runCycle().finally(() => (running = false))
  })

  function setEnabled(v) {
    enabled = v
    if (!v) stopAll()
    bot.chat(v ? "Lenhador ativado!" : "Lenhador desativado!")
  }

  function isEnabled() {
    return enabled
  }

  function stopAll() {
    bot.pathfinder.stop()
    if (bot.stopDigging) bot.stopDigging()
  } // --------------------------------------- // CICLO PRINCIPAL // ---------------------------------------

  // Lenhador:runCycle (ATUALIZADO)
  // ---------------------------------------
  // CICLO PRINCIPAL
  // ---------------------------------------
  async function runCycle() {
    if (!enabled) return

    try {
      const base = await bot.locations.get("base")
      const armazem = await bot.locations.get("estoque")

      if (!base || !armazem) {
        logger?.("[lenhador] ERRO: configure base/armazem no locations.json")
        enabled = false
        return
      }

      const wood = countLogs(bot)

      // --------------------------
      // 1) 15+ MADEIRAS → ARMAZENA NA BASE
      // --------------------------
      if (wood >= 15) {
        logger?.("[lenhador] 15+ madeiras — armazenando na base...")
        await storeInArea(bot, logger, base)
        await checkForAxe(bot, logger, armazem) // Checa machado após guardar
        return
      }

      // --------------------------
      // 2) PRECISA DE MACHADO?
      // --------------------------
      const hasAxe = bot.inventory.items().some((i) => i.name.includes("_axe"))
      let attemptedAxeSearch = false

      if (!hasAxe) {
        logger?.("[lenhador] sem machado — procurando no armazém...")
        attemptedAxeSearch = true

        const got = await checkForAxe(bot, logger, armazem)

        if (!got) {
          // Se não encontrou machado, ele avisa, mas não dá 'return'.
          bot.chat("!jebona craftar axe 1")
          logger?.(
            "[lenhador] nenhum machado encontrado — cortando com a mão..."
          )
          // O bot não espera aqui, ele segue para o corte (Etapa 3)
        }
      }

      // --------------------------
      // 3) TEM MACHADO OU NÃO → CORTAR ÁRVORE
      // --------------------------
      const tree = findNearestTree(bot)
      if (!tree) {
        logger?.("[lenhador] nenhuma árvore próxima")

        // Se tentamos buscar machado, não achamos, E não tem árvore para cortar,
        // então fazemos uma pequena pausa.
        if (attemptedAxeSearch && !hasAxe) {
          logger?.("[lenhador] Sem machado e sem árvore. Aguardando...")
          await bot.waitForTicks(60)
        }
        return
      }

      const basePos = findTrunkBase(bot, tree.position)
      await moveTo(bot, basePos)
      await cutTrunk(bot, basePos)
    } catch (e) {
      logger?.(`[lenhador] erro: ${e}`)
    }
  }

  // Lenhador:checkForAxe (ATUALIZADO)
  // ---------------------------------------
  // PROCURAR MACHADO
  // ---------------------------------------
  async function checkForAxe(bot, logger, area) {
    // Lista de machados por prioridade (do melhor para o pior)
    const list = ["diamond_axe", "iron_axe", "stone_axe", "wooden_axe"]

    for (const axe of list) {
      const result = await findItemInArea(bot, logger, area, axe)

      if (result.found) {
        // 1. Pega o item do baú
        await takeItemFromChest(bot, result.chest.position, axe)
        logger?.(`[lenhador] pegando machado ${axe}`)

        // 2. Localiza o item no inventário (agora que foi pego)
        const acquiredAxe = bot.inventory.items().find((i) => i.name === axe)

        // 3. Equipa o machado na mão principal
        if (acquiredAxe) {
          try {
            await bot.equip(acquiredAxe, "hand")
            logger?.(`[lenhador] equipou o machado ${axe}.`)
          } catch (e) {
            logger?.(`[lenhador] Erro ao equipar machado: ${e.message}`)
          }
        }
        return true
      }
    }
    return false
  }

  async function storeInArea(bot, logger, area) {
    // CORREÇÃO 1: findChestsInArea é síncrona, REMOVER 'await'
    const chests = findChestsInArea(area)
    if (!chests.length) {
      logger?.("[lenhador] Nenhum baú encontrado!")
      return false
    }

    const chest = chests[0]
    await moveTo(bot, chest.position)

    const win = await bot.openContainer(chest)
    try {
      for (const item of bot.inventory.items()) {
        await win.deposit(item.type, item.metadata, item.count)
      }
    } finally {
      win.close()
    }

    return true
  } // --------------------------------------- // PROCURAR ITEM NA ÁREA // ---------------------------------------

  async function findItemInArea(bot, logger, area, itemName) {
    // CORREÇÃO 1: findChestsInArea é síncrona, SEM 'await'
    const chests = findChestsInArea(area)

    for (const chest of chests) {
      await moveTo(bot, chest.position)

      let win
      try {
        win = await bot.openContainer(chest)
      } catch {
        continue
      }

      try {
        const item = win.containerItems().find((i) => i.name === itemName)
        if (item) {
          win.close()
          return { found: true, chest, item }
        }
      } finally {
        win.close()
      }
    }

    return { found: false }
  } // --------------------------------------- // PEGAR ITEM DO BAÚ // ---------------------------------------

  async function takeItemFromChest(bot, pos, itemName) {
    const chest = bot.blockAt(pos)
    const win = await bot.openContainer(chest)

    try {
      const item = win.containerItems().find((i) => i.name === itemName)
      if (item) {
        await win.withdraw(item.type, item.metadata, 1)
      }
    } finally {
      win.close()
    }
  } // --------------------------------------- // ACHAR BAÚS DENTRO DA ÁREA // ---------------------------------------

  function findChestsInArea(loc) {
    const minX = loc.x
    const maxX = loc.x + (loc.width || 1)
    const minZ = loc.z
    const maxZ = loc.z + (loc.depth || 1)
    // CORREÇÃO 2: Ajuste min/maxY para ser mais preciso. Se loc.y for a coordenada
    // do chão/bloco base, esta faixa permite baús de até 3 blocos de altura acima.
    const minY = loc.y
    const maxY = loc.y + 1

    const all = bot.findBlocks({
      matching: [
        bot.registry.blocksByName["chest"].id,
        bot.registry.blocksByName["barrel"]?.id,
        bot.registry.blocksByName["trapped_chest"]?.id,
      ].filter(Boolean),
      maxDistance: 64,
      count: 200,
    })

    return all
      .map((pos) => bot.blockAt(pos))
      .filter((block) => {
        const p = block.position
        return (
          p.x >= minX &&
          p.x <= maxX &&
          p.z >= minZ &&
          p.z <= maxZ &&
          p.y >= minY &&
          p.y <= maxY // Usando o Y ajustado para 2 blocos (y e y+1)
        )
      })
      .sort(
        (a, b) =>
          bot.entity.position.distanceTo(a.position) -
          bot.entity.position.distanceTo(b.position)
      )
  } // --------------------------------------- // MOVIMENTO // ---------------------------------------

  async function moveTo(bot, pos) {
    const mov = new Movements(bot)
    mov.canDig = false
    bot.pathfinder.setMovements(mov)

    await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 1))
  } // --------------------------------------- // ACHAR ÁRVORE MAIS PRÓXIMA // ---------------------------------------

  function findNearestTree(bot) {
    const ids = TREE_TYPES.map((n) => bot.registry.blocksByName[n]?.id).filter(
      Boolean
    )

    const found = bot.findBlocks({
      matching: ids,
      maxDistance: 40,
      count: 60,
    })

    if (!found.length) return null

    return found
      .map((p) => bot.blockAt(p))
      .filter(Boolean)
      .sort(
        (a, b) =>
          bot.entity.position.distanceTo(a.position) -
          bot.entity.position.distanceTo(b.position)
      )[0]
  } // --------------------------------------- // ENCONTRAR BASE DO TRONCO // ---------------------------------------

  function findTrunkBase(bot, pos) {
    let current = bot.blockAt(pos)
    let base = current

    while (current) {
      const below = bot.blockAt(current.position.offset(0, -1, 0))
      if (below && TREE_TYPES.includes(below.name)) {
        base = below
        current = below
        continue
      }
      break
    }

    return base?.position ?? pos
  } // --------------------------------------- // CORTAR TRONCO // ---------------------------------------

  async function cutTrunk(bot, startPos) {
    let pos = startPos

    while (enabled) {
      const block = bot.blockAt(pos)
      if (!block || !TREE_TYPES.includes(block.name)) break

      await bot.dig(block)
      pos = pos.offset(0, 1, 0)
    }
  } // --------------------------------------- // CONTAR MADEIRAS // ---------------------------------------

  function countLogs(bot) {
    return bot.inventory
      .items()
      .filter((i) => i.name.endsWith("_log"))
      .reduce((a, b) => a + b.count, 0)
  }

  return { setEnabled, isEnabled }
}
