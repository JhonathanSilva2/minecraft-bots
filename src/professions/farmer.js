import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const CROP_NAME = "wheat"
const SEED_NAME = "wheat_seeds"
const HARVEST_AGE = 7

export function createFarmer(bot, logger) {
  let enabled = false
  let state = "IDLE"

  let ctx = {
    targetBlock: null,
    farmZone: null,
  }

  // ==========================================================
  // 1. LOOP DE CONTROLE
  // ==========================================================
  async function startControlLoop() {
    logger?.("[Farmer] Loop Ninja (Anti-Pulo) iniciado.")

    ctx.farmZone = await bot.locations.get("fazenda")
    if (!ctx.farmZone) {
      logger?.("[Farmer] ERRO: Local 'fazenda' não encontrado!")
      enabled = false
      return
    }

    while (enabled) {
      try {
        await runState()
        await bot.waitForTicks(20)
      } catch (err) {
        logger?.(`[Farmer] Erro: ${err.message}`)
        await bot.waitForTicks(40)
      }
    }
  }

  // ==========================================================
  // 2. MÁQUINA DE ESTADOS
  // ==========================================================
  async function runState() {
    switch (state) {
      case "IDLE":
        state = "GO_FARM"
        break

      case "GO_FARM":
        await doGoFarm()
        break

      case "CHECK_WORK":
        await doCheckWork()
        break

      case "HARVEST":
        await doHarvest()
        break

      case "GO_BASE":
        await doGoBase()
        break

      case "DEPOSIT_ALL":
        await doDepositAll()
        break

      case "CHECK_SEEDS":
        await doCheckSeeds()
        break

      case "GO_ESTOQUE":
        await doGoEstoque()
        break

      case "GET_SEEDS":
        await doGetSeeds()
        break

      case "PLANT":
        await doPlant()
        break

      case "WAIT":
        // Desativa o sneak enquanto espera para parecer normal
        bot.setControlState("sneak", false)
        await bot.waitForTicks(100)
        state = "CHECK_WORK"
        break

      default:
        state = "GO_FARM"
    }
  }

  // ==========================================================
  // 3. AÇÕES
  // ==========================================================

  async function doGoFarm() {
    try {
      // Se estiver longe, anda normal. Se estiver perto, ativa o modo ninja.
      if (bot.entity.position.distanceTo(ctx.farmZone) < 8) {
        bot.setControlState("sneak", true) // <--- ATIVA O SHIFT
        state = "CHECK_WORK"
        return
      }

      // Vai até a borda da fazenda
      await moveTo(
        bot,
        new Vec3(ctx.farmZone.x, ctx.farmZone.y, ctx.farmZone.z),
        false
      )
      state = "CHECK_WORK"
    } catch (err) {
      state = "WAIT"
    }
  }

  async function doCheckWork() {
    // Garante que o sneak está ligado dentro da fazenda
    bot.setControlState("sneak", true)

    // 1. Inventário Cheio?
    if (bot.inventory.emptySlotCount() < 2) {
      state = "GO_BASE"
      return
    }

    // 2. COLHER TUDO
    const matureCrop = scanZoneForHarvest(bot, ctx.farmZone)
    if (matureCrop) {
      ctx.targetBlock = matureCrop
      state = "HARVEST"
      return
    }

    // 3. Tem trigo pra guardar?
    const hasWheat = bot.inventory.items().some((i) => i.name === CROP_NAME)
    if (hasWheat) {
      state = "GO_BASE"
      return
    }

    // 4. PLANTAR TUDO
    const emptySpot = scanZoneForPlanting(bot, ctx.farmZone)
    if (emptySpot) {
      ctx.targetBlock = emptySpot
      state = "CHECK_SEEDS"
      return
    }

    state = "WAIT"
  }

  async function doHarvest() {
    const block = ctx.targetBlock
    const currentBlock = bot.blockAt(block.position)

    if (!currentBlock || currentBlock.name !== CROP_NAME) {
      state = "CHECK_WORK"
      return
    }

    try {
      // Safe Mode = TRUE (Sem pular)
      await moveTo(bot, block.position, true)
      await bot.dig(block)
      await collectDrops(bot)
      state = "CHECK_WORK"
    } catch (err) {
      state = "CHECK_WORK"
    }
  }

  async function doGoBase() {
    // Saiu da fazenda? Pode soltar o shift e correr
    bot.setControlState("sneak", false)
    try {
      await bot.movement.gotoLocation("base")
      state = "DEPOSIT_ALL"
    } catch (err) {
      state = "GO_FARM"
    }
  }

  async function doDepositAll() {
    const manager = bot.movement.storeItemsInZone ? bot.movement : bot.logistics
    if (manager) {
      await manager.storeItemsInZone("base", (i) => i.name === CROP_NAME)
    }
    state = "GO_FARM"
  }

  async function doCheckSeeds() {
    const hasSeeds = bot.inventory.items().some((i) => i.name === SEED_NAME)
    if (hasSeeds) {
      state = "PLANT"
    } else {
      state = "GO_ESTOQUE"
    }
  }

  async function doGoEstoque() {
    bot.setControlState("sneak", false) // Pode correr pro estoque
    try {
      await bot.movement.gotoLocation("estoque")
      state = "GET_SEEDS"
    } catch (err) {
      state = "GO_FARM"
    }
  }

  async function doGetSeeds() {
    if (!bot.logistics) {
      state = "GO_FARM"
      return
    }
    const seedsId = bot.registry.itemsByName[SEED_NAME].id
    await bot.logistics.retrieveItemsFromZone("estoque", [
      { ids: [seedsId], count: 64 },
    ])
    state = "GO_FARM"
  }

  async function doPlant() {
    // Garante sneak na hora de plantar
    bot.setControlState("sneak", true)

    const soil = ctx.targetBlock
    const seeds = bot.inventory.items().find((i) => i.name === SEED_NAME)

    if (!seeds) {
      state = "GO_ESTOQUE"
      return
    }

    if (soil) {
      try {
        // Aumentei a tolerância para 3 blocos.
        // Ele não precisa estar EXATAMENTE em cima para plantar, evita pisar no bloco.
        await moveTo(bot, soil.position, true, 3.0)

        const farmland = bot.blockAt(soil.position.offset(0, -1, 0))
        if (farmland && farmland.name === "farmland") {
          await bot.equip(seeds, "hand")
          await bot.placeBlock(farmland, new Vec3(0, 1, 0))
          await bot.waitForTicks(2)
        }
      } catch (err) {}
    }

    // Procura o próximo buraco IMEDIATAMENTE
    const nextSpot = scanZoneForPlanting(bot, ctx.farmZone)
    if (nextSpot) {
      ctx.targetBlock = nextSpot
      state = "PLANT"
    } else {
      state = "CHECK_WORK"
    }
  }

  // ==========================================================
  // 4. HELPERS BLINDADOS
  // ==========================================================

  async function moveTo(bot, pos, safeMode, range = 2.5) {
    const mov = new pf.Movements(bot)
    mov.canDig = false

    if (safeMode) {
      // Configurações ANTI-DESTRUIÇÃO
      mov.allowParkour = false // Proíbe pular
      mov.allowSprinting = false // Proíbe correr
      bot.setControlState("sneak", true) // FORÇA O SHIFT
    } else {
      mov.allowParkour = true
      bot.setControlState("sneak", false)
    }

    bot.pathfinder.setMovements(mov)

    try {
      await bot.pathfinder.goto(
        new pf.goals.GoalNear(pos.x, pos.y, pos.z, range)
      )
    } catch (e) {
      // Se falhar o pathfinding, tenta olhar e forçar um micro-movimento
      if (safeMode) bot.lookAt(pos)
    }
  }

  function scanZoneForHarvest(bot, zone) {
    const wheatId = bot.registry.blocksByName[CROP_NAME].id
    for (let x = zone.x; x < zone.x + zone.width; x++) {
      for (let z = zone.z; z < zone.z + zone.depth; z++) {
        const farmlandY = findFarmlandY(bot, x, z, zone.y)
        if (farmlandY === null) continue
        const block = bot.blockAt(new Vec3(x, farmlandY + 1, z))
        if (block && block.type === wheatId && block.metadata === HARVEST_AGE) {
          return block
        }
      }
    }
    return null
  }

  function scanZoneForPlanting(bot, zone) {
    // Percorre a zona
    for (let x = zone.x; x < zone.x + zone.width; x++) {
      for (let z = zone.z; z < zone.z + zone.depth; z++) {
        const farmlandY = findFarmlandY(bot, x, z, zone.y)
        if (farmlandY === null) continue

        const pos = new Vec3(x, farmlandY + 1, z)
        const blockAbove = bot.blockAt(pos)

        // Verifica se é AR e se NÃO tem entidade (bot/player/item) bloqueando
        // Isso ajuda a evitar tentar plantar onde ele mesmo está pisando
        if (
          blockAbove &&
          (blockAbove.name === "air" || blockAbove.name === "cave_air")
        ) {
          // Verificação extra de distância para não plantar longe demais e bugar
          if (bot.entity.position.distanceTo(pos) < 40) return blockAbove
        }
      }
    }
    return null
  }

  function findFarmlandY(bot, x, z, startY) {
    for (let y = startY - 2; y <= startY + 2; y++) {
      const block = bot.blockAt(new Vec3(x, y, z))
      if (block && block.name === "farmland") return y
    }
    return null
  }

  async function collectDrops(bot) {
    const drops = Object.values(bot.entities).filter(
      (e) => e.name === "item" && e.position.distanceTo(bot.entity.position) < 4
    )
    for (const drop of drops) {
      if (drop.isValid) {
        try {
          await moveTo(bot, drop.position, true)
        } catch {}
      }
    }
  }

  function setEnabled(v) {
    if (enabled === v) return
    enabled = v
    if (v) {
      bot.chat("Agricultor Ninja Ativado.")
      state = "IDLE"
      startControlLoop().catch(console.error)
    } else {
      bot.chat("Agricultor Parado.")
      bot.setControlState("sneak", false) // Solta o shift ao desligar
      bot.pathfinder.stop()
    }
  }

  return { setEnabled }
}
