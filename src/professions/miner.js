import pathfinder from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals } = pathfinder
const { Movements } = pathfinder

const STATE = {
  IDLE: 'idle',
  TRAVELING_TO_BASE: 'traveling_to_base',
  TRAVELING_TO_MINE: 'traveling_to_mine',
  MINING: 'mining',
  RETURNING_BASE: 'returning_base',
  DEPOSITING: 'depositing',
  WAITING_FOR_TOOL: 'waiting_for_tool'
}

const ORE_TARGETS = [
    'coal_ore', 'deepslate_coal_ore',
    'iron_ore', 'deepslate_iron_ore', 'raw_iron_block',
    'copper_ore', 'deepslate_copper_ore', 'raw_copper_block',
    'gold_ore', 'deepslate_gold_ore', 'raw_gold_block',
    'redstone_ore', 'deepslate_redstone_ore',
    'lapis_ore', 'deepslate_lapis_ore',
    'emerald_ore', 'deepslate_emerald_ore',
    'diamond_ore', 'deepslate_diamond_ore',
    'nether_quartz_ore', 'nether_gold_ore',
    'ancient_debris'
]

export function createMiner(bot, logger) {
  const manager = bot.mining
  const logistics = bot.logistics
  
  if (!manager) throw new Error("MinerManager ausente!")
  
  // Variáveis de Estado
  let enabled = false
  let currentState = STATE.IDLE
  let hasRequestedCraft = false 
  let miningStuckCounter = 0
  let lastMiningPos = null 
  
  // Lista de blocos que falharam
  const failedBlocks = new Set()

  const CONFIG = {
    baseLocation: null,
    mineStartLocation: null,
    direction: 'north',
    stoneLimit: 256,
    checkChestInterval: 10000 
  }

  const phrases = {
    start: ["Bora trabalhar!", "Picareta afiada, vamos nessa.", "Iniciando escavação."],
    full: ["Mochila cheia! Voltando para guardar.", "Estoque lotado.", "Vou descarregar e já volto."],
    broken: ["Quebrou a picareta...", "Preciso de ferramenta nova.", "Ferrou, sem picareta."],
    rich: ["Opa! Minério!", "Achado bom!", "Dinheiro no bolso."],
    stuck: ["Algo no caminho... forçando passagem.", "Caminho bloqueado, tentando desviar."],
    lost: ["Me perdi um pouco, tentando achar um caminho novo."]
  }
  
  const randomSay = (cat) => {
    if (Math.random() > 0.4) return 
    const list = phrases[cat]
    if (list) bot.chat(list[Math.floor(Math.random() * list.length)])
  }

  // --- CONTROLE ---
  async function setEnabled(value) {
    enabled = value
    
    if (value) {
      failedBlocks.clear() // Limpa erros antigos

      if (!CONFIG.baseLocation) {
          const savedBase = await bot.locations.get("base")
          if (savedBase) {
              CONFIG.baseLocation = new Vec3(savedBase.x, savedBase.y, savedBase.z)
              logger(`[Miner] Base carregada: ${savedBase.x}, ${savedBase.y}, ${savedBase.z}`)
          } else {
              logger("[Miner] Usando posição atual como base.")
              CONFIG.baseLocation = bot.entity.position.clone()
          }
      }
      
      if (!CONFIG.mineStartLocation) {
        const offset = { x: 0, z: 0 }
        if (CONFIG.direction === 'north') offset.z = -15
        if (CONFIG.direction === 'south') offset.z = 15
        if (CONFIG.direction === 'east') offset.x = 15
        if (CONFIG.direction === 'west') offset.x = -15
        CONFIG.mineStartLocation = CONFIG.baseLocation.offset(offset.x, 0, offset.z)
      }
      
      if (lastMiningPos) {
          bot.chat("Retomando de onde parei.")
          currentState = STATE.TRAVELING_TO_MINE 
      } else {
          randomSay('start')
          currentState = STATE.TRAVELING_TO_BASE 
      }

      hasRequestedCraft = false 
      miningStuckCounter = 0
      gameLoop() 
    } else {
      bot.chat("Minerador parando.")
      currentState = STATE.IDLE
      bot.pathfinder.stop()
    }
  }

  function setConfig(basePos, minePos, dir) {
    if (basePos) CONFIG.baseLocation = basePos
    if (minePos) CONFIG.mineStartLocation = minePos
    if (dir) CONFIG.direction = dir
    lastMiningPos = null 
  }

  async function gameLoop() {
    while (enabled) {
      try {
        switch (currentState) {
          case STATE.TRAVELING_TO_BASE: await handleTravelToBase(); break;
          case STATE.TRAVELING_TO_MINE: await handleTravelToMine(); break;
          case STATE.MINING: await handleMining(); break;
          case STATE.RETURNING_BASE: await handleReturnBase(); break;
          case STATE.DEPOSITING: await handleDepositing(); break;
          case STATE.WAITING_FOR_TOOL: await handleWaitingForTool(); break;
        }
      } catch (err) {
        // Log seguro para evitar crash no logger também
        const msg = err && err.message ? err.message : "Erro desconhecido"
        logger?.(`[Miner] Erro recuperável no loop: ${msg}`)
        await bot.waitForTicks(20)
      }
      await bot.waitForTicks(10)
    }
  }

  // --- ESTADOS ---

  async function handleTravelToBase() {
    const move = new Movements(bot)
    move.canDig = false
    move.allowParkour = true
    bot.pathfinder.setMovements(move)

    const base = CONFIG.baseLocation
    if (bot.entity.position.distanceTo(base) > 3) {
        await bot.pathfinder.goto(new goals.GoalNear(base.x, base.y, base.z, 1.0))
    }

    if (!manager.hasPickaxe()) {
        logger("[Miner] Na base, sem picareta. Buscando...")
        currentState = STATE.WAITING_FOR_TOOL
    } else {
        logger("[Miner] Pronto. Partiu mina!")
        currentState = STATE.TRAVELING_TO_MINE
    }
  }

  async function handleTravelToMine() {
    const move = new Movements(bot)
    move.canDig = false 
    move.allowParkour = true
    bot.pathfinder.setMovements(move)

    const target = lastMiningPos || CONFIG.mineStartLocation
    
    if (bot.entity.position.distanceTo(target) > 3) {
      await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1.5))
    }
    
    currentState = STATE.MINING
  }

  async function handleMining() {
    lastMiningPos = bot.entity.position.clone()

    const stoneCount = manager.countItem('cobblestone') + manager.countItem('stone') + manager.countItem('deepslate')
    const hasPick = manager.hasPickaxe()

    if (!hasPick) {
      randomSay('broken')
      currentState = STATE.RETURNING_BASE
      return
    }

    if (stoneCount >= CONFIG.stoneLimit) {
      randomSay('full')
      currentState = STATE.RETURNING_BASE
      return
    }

    if (bot.entity.position.y <= -59) {
      logger("[Miner] Bedrock ou limite atingido. Retornando.")
      currentState = STATE.RETURNING_BASE
      return
    }

    // 1. Scan e Mineração
    let foundOre = true
    while (foundOre) {
        foundOre = await scanAndMineOres()
        if (foundOre) await bot.waitForTicks(5)
    }

    // 2. Cavar Túnel
    const success = await manager.digStaircaseStep(CONFIG.direction)
    
    if (!success) {
        miningStuckCounter++
        logger(`[Miner] Bloqueado (${miningStuckCounter}). Tentando resolver...`)

        if (miningStuckCounter <= 3) {
             randomSay('stuck')
             await clearObstruction()
             await forceMoveForward() 
        } 
        else if (miningStuckCounter > 3 && miningStuckCounter < 10) {
             logger("[Miner] Muito preso. Tentando movimento aleatório.")
             randomSay('lost')
             await attemptRandomEvasion()
        } 
        else {
             bot.chat("Estou muito preso mesmo. Voltando para base.")
             currentState = STATE.RETURNING_BASE
             miningStuckCounter = 0
        }
    } else {
        miningStuckCounter = 0
    }
  }

  // === AUXILIARES DE MOVIMENTO ===

  async function forceMoveForward() {
      const offset = { x: 0, z: 0 }
      if (CONFIG.direction === 'north') offset.z = -2
      if (CONFIG.direction === 'south') offset.z = 2
      if (CONFIG.direction === 'east') offset.x = 2
      if (CONFIG.direction === 'west') offset.x = -2

      const target = bot.entity.position.offset(offset.x, 0, offset.z)
      
      const move = new Movements(bot)
      move.canDig = true
      move.allowParkour = true
      bot.pathfinder.setMovements(move)

      try {
          await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1))
      } catch (e) {
          // Ignora
      }
  }

  async function attemptRandomEvasion() {
      const rx = (Math.random() - 0.5) * 10
      const rz = (Math.random() - 0.5) * 10
      
      const target = bot.entity.position.offset(rx, 0, rz)
      
      const move = new Movements(bot)
      move.canDig = true
      move.allowParkour = true
      bot.pathfinder.setMovements(move)

      try {
           logger(`[Miner] Tentando evasão para: ${Math.floor(target.x)}, ${Math.floor(target.z)}`)
           await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1))
      } catch (e) {
           logger("[Miner] Falha na evasão aleatória.")
      }
  }

  async function clearObstruction() {
      const targetBlock = bot.blockAtCursor(4)
      if (targetBlock && targetBlock.diggable && targetBlock.name !== 'bedrock') {
          try { await bot.dig(targetBlock) } catch(e) {}
      }
  }

  // === SCANNER BLINDADO ===
  async function scanAndMineOres() {
      // 1. Encontra bloco válido
      const oreBlock = bot.findBlock({
          matching: (block) => {
             // BLINDAGEM CONTRA NULL NA BUSCA
             if (!block || !block.name || !block.position) return false
             
             // Check seguro com Optional Chaining
             if (failedBlocks.has(block.position?.toString())) return false
             
             return ORE_TARGETS.includes(block.name)
          },
          maxDistance: 6 
      })

      if (!oreBlock) return false

      // 2. Tenta Minerar
      try {
          randomSay('rich')
          logger(`[Miner] Minério encontrado: ${oreBlock.name}`)
          
          await bot.mining.equipPickaxe() 

          const mined = await manager.mineVein(oreBlock)
          
          if (!mined) {
               logger(`[Miner] mineVein falhou para ${oreBlock.name}. Tentando fallback manual...`)
               
               const move = new Movements(bot)
               move.canDig = true
               bot.pathfinder.setMovements(move)
               
               try {
                   // BLINDAGEM CONTRA NULL NO PATHFINDER
                   if (!oreBlock.position) throw new Error("Posição inválida")
                   
                   // Valida se o bloco ainda está lá
                   if (!bot.blockAt(oreBlock.position)) throw new Error("Bloco sumiu")

                   await bot.pathfinder.goto(new goals.GoalBreakBlock(oreBlock.position.x, oreBlock.position.y, oreBlock.position.z))
                   return true 
               } catch (pathErr) {
                   logger(`[Miner] Erro no pathfinder fallback: ${pathErr.message}`)
                   
                   // BLINDAGEM AO ADICIONAR NA LISTA NEGRA
                   if (oreBlock && oreBlock.position) {
                        failedBlocks.add(oreBlock.position.toString())
                   }
                   return false
               }
          }
          return true 
      } catch (e) {
          logger(`[Miner] Erro geral ao minerar: ${e.message}`)
          
          // BLINDAGEM AO ADICIONAR NA LISTA NEGRA
          if (oreBlock && oreBlock.position) {
              failedBlocks.add(oreBlock.position.toString())
          }
          return false
      }
  }

  async function handleReturnBase() {
    const returnMove = new Movements(bot)
    returnMove.canDig = false       
    returnMove.allowParkour = true
    returnMove.allowSprinting = true
    returnMove.canPlaceOn = false   
    bot.pathfinder.setMovements(returnMove)

    logger("[Miner] Retornando para a base...")
    try {
        await bot.pathfinder.goto(new goals.GoalNear(CONFIG.baseLocation.x, CONFIG.baseLocation.y, CONFIG.baseLocation.z, 1.5))
        currentState = STATE.DEPOSITING
    } catch (e) {
        logger("[Miner] Erro no pathfinding de volta. Parando perto.")
        setEnabled(false)
    }
  }

  async function handleDepositing() {
    const itemsToKeep = (item) => {
        return item.name.includes('pickaxe') || 
               item.name.includes('sword') || 
               item.name.includes('torch') ||
               item.name.includes('bread') || 
               item.name.includes('cooked_beef') || 
               item.name.includes('helmet') ||
               item.name.includes('chestplate') ||
               item.name.includes('leggings') ||
               item.name.includes('boots')
    }

    const depositFilter = (item) => !itemsToKeep(item)
    
    logger("[Miner] Guardando itens...")
    await logistics.storeItemsInZone("base", depositFilter)
    
    if (!manager.hasPickaxe()) {
        currentState = STATE.WAITING_FOR_TOOL
    } else {
        bot.chat("Mochila vazia. Voltando para a mina!")
        currentState = STATE.TRAVELING_TO_MINE 
    }
  }

  async function handleWaitingForTool() {
    if (await bot.locations.has("estoque")) {
        if (typeof bot.movement.gotoLocation === 'function') {
             await bot.movement.gotoLocation("estoque")
        }
    }

    const pickaxeTiers = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe']
    let gotTool = false

    for (const pickName of pickaxeTiers) {
        const itemData = bot.registry.itemsByName[pickName]
        if (!itemData) continue

        const req = [{ ids: [itemData.id], count: 1 }]
        const success = await logistics.retrieveItemsFromZone("estoque", req)
        
        if (success) {
            gotTool = true
            break 
        }
    }

    if (gotTool || manager.hasPickaxe()) {
        bot.chat("Consegui uma picareta!")
        hasRequestedCraft = false 
        currentState = STATE.TRAVELING_TO_MINE
        return
    }

    if (!hasRequestedCraft) {
        bot.chat("!PedroCrafter craftar picareta") 
        bot.chat("Estou sem picareta. Alguém coloca uma no baú de Estoque?")
        hasRequestedCraft = true 
    }

    await bot.waitForTicks(100) 
  }

  return { setEnabled, setConfig }
}