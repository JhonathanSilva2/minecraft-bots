import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

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
  // Variáveis de Controle
  let enabled = false
  let state = "IDLE"

  // Contexto e Memória
  let ctx = {
    targetTreePos: null,
    treeType: null,
  }

  // FLAG: Impede o loop infinito "Vai pro estoque -> Não acha -> Vai pro estoque"
  let axeCheckAttempted = false

  // ==========================================================
  // 1. LOOP DE CONTROLE ASSÍNCRONO
  // ==========================================================

  async function startControlLoop() {
    logger?.("[System] Iniciando Loop de Controle Assíncrono...")

    while (enabled) {
      try {
        await runState()
        await bot.waitForTicks(20) // Pausa para respirar
      } catch (err) {
        logger?.(`[FSM] Erro Crítico no loop: ${err.message}`)
        await bot.waitForTicks(40)
      }
    }

    logger?.("[System] Loop encerrado.")
  }

  // ==========================================================
  // 2. MÁQUINA DE ESTADOS
  // ==========================================================
  async function runState() {
    switch (state) {
      case "IDLE":
        state = "CHECK_STATUS"
        break

      case "CHECK_STATUS":
        await doCheckStatus()
        break

      // --- ROTA DO ESTOQUE ---
      case "GO_ESTOQUE":
        await doGoEstoque()
        break

      case "SEARCH_AXE":
        await doSearchAxe()
        break

      case "ASK_FOR_AXE": // <--- COMANDO NOVO AQUI
        await doAskForAxe()
        break

      // --- ROTA DA ÁRVORE ---
      case "FIND_TREE":
        await doFindTree()
        break

      case "GO_TREE":
        await doGoTree()
        break

      case "CUT_TREE":
        await doCutTree()
        break

      case "REPLANT":
        await doReplant()
        break
      // --- ROTA DA BASE ---
      case "GO_BASE":
        await doGoBase()
        break

      case "DEPOSIT_WOOD":
        await doDepositWood()
        break

      // --- ESPERA ---
      case "WAIT":
        logger?.("[FSM] Aguardando respawn...")
        await bot.waitForTicks(100)
        state = "CHECK_STATUS"
        break

      default:
        logger?.(`[FSM] Estado desconhecido: ${state}. Resetando.`)
        state = "CHECK_STATUS"
    }
  }

  // ==========================================================
  // 3. AÇÕES
  // ==========================================================

  async function doCheckStatus() {
    const woodCount = countLogs(bot)

    if (woodCount >= 64) {
      logger?.(`[FSM] Inventário cheio (${woodCount}). -> Go Base`)
      state = "GO_BASE"
      ctx.lastWoodAnnounced = 0
      return
    }
    if (typeof ctx.lastWoodAnnounced === "undefined") ctx.lastWoodAnnounced = 0
    if (woodCount >= 16 && woodCount !== ctx.lastWoodAnnounced) {
      logger?.(`[FSM] Madeira coletada: ${woodCount}`)
      bot.chat(`Madeira coletada: ${woodCount}`)
      ctx.lastWoodAnnounced = woodCount
    }

    const hasAxe = bot.inventory.items().some((i) => i.name.includes("_axe"))

    if (hasAxe) {
      // Se tem machado, reseta a tentativa para o futuro e vai trabalhar
      axeCheckAttempted = false
      state = "FIND_TREE"
      return
    }

    // Se NÃO tem machado, checamos: "Já tentamos buscar recentemente?"
    if (!axeCheckAttempted) {
      logger?.("[FSM] Has Axe? NÃO. -> Go Estoque")
      state = "GO_ESTOQUE"
    } else {
      // Se já tentamos e falhou, ignoramos a falta de machado e seguimos o fluxo
      logger?.("[FSM] Sem machado (Já verificado). -> Cortar na mão.")
      state = "FIND_TREE"
    }
  }

  async function doGoEstoque() {
    logger?.("[FSM] Viajando para o estoque...")

    try {
      if (!bot.movement) throw new Error("Sem MovementManager")

      const move = bot.movement.gotoLocation("estoque")
      const timeout = new Promise((_, r) =>
        setTimeout(() => r(new Error("TIMEOUT")), 40000)
      )

      await Promise.race([move, timeout])

      logger?.("[FSM] Cheguei. -> Search Stock")
      state = "SEARCH_AXE"
    } catch (err) {
      logger?.(`[FSM] Falha ao ir estoque.`)
      axeCheckAttempted = true
      state = "ASK_FOR_AXE"
    }
  }

  async function doSearchAxe() {
    logger?.("[FSM] Search Stock...")

    if (!bot.logistics) {
      state = "ASK_FOR_AXE"
      return
    }

    try {
      const gotAxe = await findAndEquipAxe(bot, logger, "estoque")

      if (gotAxe) {
        logger?.("[FSM] Find Axe? SIM.")
        axeCheckAttempted = false // Sucesso!
        state = "CHECK_STATUS"
      } else {
        logger?.("[FSM] Find Axe? NÃO.")
        state = "ASK_FOR_AXE" // Segue o diagrama
      }
    } catch (err) {
      state = "ASK_FOR_AXE"
    }
  }

  async function doAskForAxe() {
    // Marcamos que JÁ TENTAMOS pegar o machado
    axeCheckAttempted = true

    // COMANDO ATUALIZADO
    bot.chat("!PedroCrafter craftar machado 1")
    logger?.("[FSM] Pedido enviado: !jebona craftar machado 1")

    // Segue o fluxo para cortar madeira na mão enquanto espera
    state = "CHECK_STATUS"
  }

  async function doGoBase() {
    try {
      await bot.movement.gotoLocation("base")
      state = "DEPOSIT_WOOD"
    } catch (err) {
      logger?.("[FSM] Erro ao ir para base.")
      state = "CHECK_STATUS"
    }
  }

  async function doDepositWood() {
    const manager = bot.movement.storeItemsInZone ? bot.movement : bot.logistics
    if (manager) {
      await manager.storeItemsInZone("base", (i) => i.name.endsWith("_log"))
      logger?.("[FSM] Itens guardados.")
    }

    // Ao guardar, resetamos a flag para ele ter direito de buscar machado novo depois
    axeCheckAttempted = false
    state = "FIND_TREE"
  }

  async function doFindTree() {
    const tree = findNearestTree(bot)
    if (!tree) {
      state = "WAIT"
      return
    }

    ctx.targetTreePos = findTrunkBase(bot, tree.position)
    ctx.treeType = tree.name
    state = "GO_TREE"
  }

  async function doGoTree() {
    const pos = ctx.targetTreePos
    if (!pos) {
      state = "FIND_TREE"
      return
    }

    const mov = new pf.Movements(bot)
    mov.canDig = false
    mov.allowParkour = true
    bot.pathfinder.setMovements(mov)

    try {
      await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 1.5))
      state = "CUT_TREE"
    } catch (err) {
      state = "FIND_TREE"
    }
  }

  async function doCutTree() {
    const pos = ctx.targetTreePos
    logger?.(`[FSM] Collect Wood...`)

    await cutTrunkLogic(bot, pos)
    await collectDrops(bot)

    state = "REPLANT"
  }
  async function doReplant() {
    // 1. Tem muda no inventário?
    const sapling = bot.inventory
      .items()
      .find((i) => i.name.includes("sapling"))

    if (!sapling) {
      // Sem muda, paciência. Segue o jogo.
      logger?.("[FSM] Sem mudas para replantar.")
      state = "CHECK_STATUS"
      return
    }

    // 2. Onde plantar? (No local onde estava a base do tronco)
    const pos = ctx.targetTreePos
    if (!pos) {
      state = "CHECK_STATUS"
      return
    }

    // O bloco "chão" é um bloco abaixo da posição do tronco
    const dirtBlock = bot.blockAt(pos.offset(0, -1, 0))

    // 3. Validação de segurança
    if (
      dirtBlock &&
      (dirtBlock.name === "dirt" || dirtBlock.name === "grass_block")
    ) {
      try {
        // Equipa a muda
        await bot.equip(sapling, "hand")

        // Olha para o chão (importante para o servidor aceitar o clique)
        await bot.lookAt(dirtBlock.position.offset(0.5, 1, 0.5))

        // Coloca o bloco (placeBlock precisa de uma referência de vetor normal, (0,1,0) significa "em cima")
        await bot.placeBlock(dirtBlock, new Vec3(0, 1, 0))

        logger?.("[FSM] Muda replantada com sucesso!")

        // PAUSA DE SEGURANÇA (Evita kick por spam)
        await bot.waitForTicks(10)
      } catch (err) {
        logger?.(`[FSM] Não consegui plantar: ${err.message}`)
      }
    } else {
      logger?.("[FSM] Local inválido para plantio (não é terra).")
    }

    // Terminou? Volta para o ciclo normal
    state = "CHECK_STATUS"
  }

  // ==========================================================
  // 4. FUNÇÕES UTILITÁRIAS
  // ==========================================================

  async function cutTrunkLogic(bot, startPos) {
    let currentPos = startPos.clone()
    while (enabled) {
      const block = bot.blockAt(currentPos)
      if (!block || !TREE_TYPES.includes(block.name)) break
      if (bot.entity.position.distanceTo(currentPos) > 5.5) break

      try {
        await bot.dig(block)
        await bot.waitForTicks(5)
      } catch (err) {
        break
      }

      currentPos = currentPos.offset(0, 1, 0)
    }
  }

  async function collectDrops(bot) {
    const drops = Object.values(bot.entities).filter(
      (e) => e.name === "item" && e.position.distanceTo(bot.entity.position) < 6
    )
    for (const drop of drops) {
      if (drop.isValid) {
        try {
          await bot.pathfinder.goto(
            new pf.goals.GoalNear(
              drop.position.x,
              drop.position.y,
              drop.position.z,
              0
            )
          )
        } catch {}
      }
    }
  }

  async function findAndEquipAxe(bot, logger, zoneName) {
    const axeNames = [
      "netherite_axe",
      "diamond_axe",
      "iron_axe",
      "golden_axe",
      "stone_axe",
      "wooden_axe",
    ]
    const axeIds = axeNames
      .map((name) => bot.registry.itemsByName[name]?.id)
      .filter((id) => id !== undefined)

    const success = await bot.logistics.retrieveItemsFromZone(zoneName, [
      { ids: axeIds, count: 1 },
    ])
    if (success) {
      await bot.logistics.equipBestTool("axe")
      return true
    }
    return false
  }

  function findNearestTree(bot) {
    const ids = TREE_TYPES.map((n) => bot.registry.blocksByName[n]?.id).filter(
      Boolean
    )
    const found = bot.findBlocks({ matching: ids, maxDistance: 300, count: 10 })
    return found.length ? bot.blockAt(found[0]) : null
  }

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
  }

  function countLogs(bot) {
    return bot.inventory
      .items()
      .filter((i) => i.name.endsWith("_log"))
      .reduce((a, b) => a + b.count, 0)
  }

  // ==========================================================
  // API PÚBLICA
  // ==========================================================

  function setEnabled(v) {
    if (enabled === v) return

    enabled = v
    if (enabled) {
      bot.chat("Lenhador FSM (Diagrama Final) Ativado.")
      state = "CHECK_STATUS"
      axeCheckAttempted = false
      startControlLoop().catch((err) => console.error("Loop crash:", err))
    } else {
      bot.chat("Lenhador Parado.")
      bot.pathfinder.stop()
      bot.stopDigging()
    }
  }

  function isEnabled() {
    return enabled
  }

  return { setEnabled, isEnabled }
}
