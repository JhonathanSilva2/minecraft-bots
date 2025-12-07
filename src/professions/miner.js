import pathfinder from "mineflayer-pathfinder"
const { goals } = pathfinder

// Estados do Robô
const STATE = {
    IDLE: 'idle',
    TRAVELING_TO_MINE: 'traveling_to_mine',
    MINING: 'mining',
    RETURNING_BASE: 'returning_base',
    DEPOSITING: 'depositing',
    WAITING_FOR_TOOL: 'waiting_for_tool'
}

export function createMiner(bot, logger) {
  const manager = bot.mining
  
  if (!manager) {
      throw new Error("MinerManager (bot.mining) não foi carregado no bot.js!")
  }
  
  let enabled = false
  let currentState = STATE.IDLE
  let loopTimeout = null
  
  // NOVA VARIÁVEL DE CONTROLE
  let hasRequestedCraft = false 

  // Configurações
  const CONFIG = {
    baseLocation: null,      // Onde fica o baú/crafter (Vec3)
    mineStartLocation: null, // Onde começa a cavar (Vec3)
    direction: 'north',      // Para onde vai cavar
    stoneLimit: 256,         // 4 Packs (64 * 4)
    checkChestInterval: 10000 // 10 segundos
  }

  function setEnabled(value) {
    enabled = value
    bot.chat(value ? "Minerador ativado." : "Minerador desligado.")
    
    if (value) {
        if (!CONFIG.baseLocation) CONFIG.baseLocation = bot.entity.position.clone()
        if (!CONFIG.mineStartLocation) {
            CONFIG.mineStartLocation = CONFIG.baseLocation.offset(-30, 0, 0)
        }
        
        currentState = STATE.TRAVELING_TO_MINE
        hasRequestedCraft = false // Reseta estado ao iniciar
        gameLoop()
    } else {
        currentState = STATE.IDLE
        hasRequestedCraft = false // Reseta estado ao parar
        if (loopTimeout) clearTimeout(loopTimeout)
        bot.pathfinder.stop()
    }
  }

  // Permite configurar via código ou comando
  function setConfig(basePos, minePos, dir) {
    if (basePos) CONFIG.baseLocation = basePos
    if (minePos) CONFIG.mineStartLocation = minePos
    if (dir) CONFIG.direction = dir
  }

  // ==========================================
  // LOOP PRINCIPAL (State Machine)
  // ==========================================
  async function gameLoop() {
    if (!enabled) return

    try {
        switch (currentState) {
            case STATE.TRAVELING_TO_MINE: await handleTravelToMine(); break;
            case STATE.MINING: await handleMining(); break;
            case STATE.RETURNING_BASE: await handleReturnBase(); break;
            case STATE.DEPOSITING: await handleDepositing(); break;
            case STATE.WAITING_FOR_TOOL: await handleWaitingForTool(); break;
        }
    } catch (err) {
        logger?.(`[Miner] Erro no loop: ${err.message}`)
        await new Promise(r => setTimeout(r, 2000))
    }

    if (enabled) {
        loopTimeout = setTimeout(gameLoop, 1000)
    }
  }

  // --- LÓGICAS DOS ESTADOS ---

  async function handleTravelToMine() {
    logger?.("[Miner] Indo para o local de mineração...")
    if (bot.entity.position.distanceTo(CONFIG.mineStartLocation) > 5) {
        await bot.pathfinder.goto(new goals.GoalNear(CONFIG.mineStartLocation.x, CONFIG.mineStartLocation.y, CONFIG.mineStartLocation.z, 2))
    }
    currentState = STATE.MINING
  }

  async function handleMining() {
    const stoneCount = manager.countItem('cobblestone') + manager.countItem('stone') + manager.countItem('deepslate')
    const hasPick = manager.hasPickaxe()

    if (!hasPick || stoneCount >= CONFIG.stoneLimit) {
        bot.chat(!hasPick ? "Picareta quebrou!" : "Inventário cheio de pedra!")
        currentState = STATE.RETURNING_BASE
        return
    }

    if (bot.entity.position.y <= -58) {
        bot.chat("Cheguei no fundo do mundo. Voltando para base.")
        currentState = STATE.RETURNING_BASE
        return
    }

    await manager.digStaircaseStep(CONFIG.direction)
  }

  async function handleReturnBase() {
    logger?.("[Miner] Voltando para base...")
    await bot.pathfinder.goto(new goals.GoalNear(CONFIG.baseLocation.x, CONFIG.baseLocation.y, CONFIG.baseLocation.z, 1))
    currentState = STATE.DEPOSITING
  }

  async function handleDepositing() {
    logger?.("[Miner] Depositando itens...")
    
    const itemsToDeposit = (item) => {
        const keep = item.name.includes('pickaxe') || 
                     item.name.includes('sword') || 
                     item.name.includes('torch') ||
                     item.name.includes('bread') || 
                     item.name.includes('steak')
        return !keep
    }

    await bot.logistics.storeItemsInZone("estoque", itemsToDeposit)
    
    if (!manager.hasPickaxe()) {
        currentState = STATE.WAITING_FOR_TOOL
    } else {
        bot.chat("Inventário limpo. Voltando ao trabalho.")
        currentState = STATE.TRAVELING_TO_MINE 
    }
  }

  async function handleWaitingForTool() {
    logger?.("[Miner] Verificando se há picareta nos baús...")

    // 1. Tenta pegar do baú
    const pickaxes = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe']
    const wanted = []
    
    for(const p of pickaxes) wanted.push({ ids: [bot.registry.itemsByName[p]?.id], count: 1 })
    
    try {
        await bot.logistics.retrieveItemsFromZone("estoque", wanted.filter(x => x.ids[0]))
    } catch (e) {
        // Ignora erro se não achar
    }

    // 2. Checou baús, tem picareta agora?
    if (manager.hasPickaxe()) {
        bot.chat("Achei uma picareta! Voltando ao trabalho.")
        hasRequestedCraft = false // RESET: Já conseguimos a ferramenta
        currentState = STATE.TRAVELING_TO_MINE
        return
    }

    // 3. Se não tem, pede pro Crafter (SÓ SE AINDA NÃO PEDIU)
    if (!hasRequestedCraft) {
        bot.chat("!jebona craftar picareta") 
        bot.chat("Estou sem picareta. Aguardando entrega ou craft...")
        hasRequestedCraft = true // TRAVA: Não pede mais até conseguir
    } else {
        logger?.("[Miner] Ainda aguardando picareta ficar pronta...")
    }

    // 4. Espera um tempo antes de checar baús de novo
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkChestInterval))
  }

  return { setEnabled, setConfig }
}