import pathfinder from "mineflayer-pathfinder"
const { goals } = pathfinder
const { Movements } = pathfinder

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
  const logistics = bot.logistics // Usando o novo LogisticsManager
  
  if (!manager) throw new Error("MinerManager (bot.mining) não carregado!")
  if (!logistics) throw new Error("LogisticsManager (bot.logistics) não carregado!")
  
  let enabled = false
  let currentState = STATE.IDLE
  let hasRequestedCraft = false 
  let miningStuckCounter = 0 // Contador para detectar se travou minerando

  // Configurações
  const CONFIG = {
    baseLocation: null,
    mineStartLocation: null,
    direction: 'north',
    stoneLimit: 256,         // 4 Packs
    checkChestInterval: 10000 
  }

  // --- MENSAGENS DIVERTIDAS ---
  const say = (msg) => bot.chat(msg)
  const phrases = {
    start: ["Bora trabalhar!", "Hora de cavar buraco.", "Picareta na mão, partiu!"],
    full: ["Mochila pesada! Voltando.", "Não cabe mais nada, indo descarregar.", "Estoque cheio!"],
    broken: ["Quebrou minha picareta...", "Ferramenta pifou. Preciso de outra.", "Ops, picareta foi pro espaço."],
    back: ["De volta à mina.", "Lá vamos nós de novo.", "Descendo!"],
    stuck: ["Acho que estou preso...", "Lugar apertado hein."]
  }
  
  function randomSay(category) {
    const list = phrases[category]
    if (list) bot.chat(list[Math.floor(Math.random() * list.length)])
  }

  // --- CONTROLE ---

  function setEnabled(value) {
    enabled = value
    
    if (value) {
      if (!CONFIG.baseLocation) CONFIG.baseLocation = bot.entity.position.clone()
      if (!CONFIG.mineStartLocation) {
        // Define inicio 30 blocos a frente da base se não definido
        CONFIG.mineStartLocation = CONFIG.baseLocation.offset(
            CONFIG.direction === 'north' ? 0 : 0, 
            0, 
            CONFIG.direction === 'north' ? -30 : 30 
            // (Simplificado, o ideal é calcular vetor)
        )
      }
      
      randomSay('start')
      currentState = STATE.TRAVELING_TO_MINE
      hasRequestedCraft = false 
      miningStuckCounter = 0
      gameLoop() // Inicia o loop
    } else {
      bot.chat("Minerador parando. Fim do expediente.")
      currentState = STATE.IDLE
      bot.pathfinder.stop()
    }
  }

  function setConfig(basePos, minePos, dir) {
    if (basePos) CONFIG.baseLocation = basePos
    if (minePos) CONFIG.mineStartLocation = minePos
    if (dir) CONFIG.direction = dir
  }

  // ==========================================
  // LOOP PRINCIPAL (Sincronizado com Ticks)
  // ==========================================
  async function gameLoop() {
    while (enabled) {
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
        await bot.waitForTicks(20) // Espera 1s em caso de erro
      }
      
      // Delay pequeno entre ciclos para não fritar a CPU e parecer natural
      await bot.waitForTicks(10) // 0.5 segundos
    }
  }

  // --- LÓGICAS DOS ESTADOS ---

  async function handleTravelToMine() {
    // Configura movimento padrão para andar na superfície
    const move = new Movements(bot)
    move.canDig = false // Não sai quebrando tudo no caminho
    move.allowParkour = true
    bot.pathfinder.setMovements(move)

    if (bot.entity.position.distanceTo(CONFIG.mineStartLocation) > 3) {
      // logger?.("[Miner] Indo para o ponto inicial da mina...")
      await bot.pathfinder.goto(new goals.GoalNear(CONFIG.mineStartLocation.x, CONFIG.mineStartLocation.y, CONFIG.mineStartLocation.z, 1.5))
    }
    
    // Chegamos
    currentState = STATE.MINING
  }

  async function handleMining() {
    // 1. Verificações de Parada
    const stoneCount = manager.countItem('cobblestone') + manager.countItem('stone') + manager.countItem('deepslate') + manager.countItem('diorite')
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

    if (bot.entity.position.y <= -58) {
      bot.chat("Cheguei no fundo do mundo (Bedrock). Voltando.")
      currentState = STATE.RETURNING_BASE
      return
    }

    // 2. Tenta cavar
    const prevPos = bot.entity.position.clone()
    
    // Chama o manager para cavar o degrau
    const success = await manager.digStaircaseStep(CONFIG.direction)
    
    // 3. Detecção de Travamento (Anti-Stuck)
    if (!success) {
        miningStuckCounter++
        logger?.(`[Miner] Falha ao cavar. Tentativa ${miningStuckCounter}`)
        
        if (miningStuckCounter > 3) {
            randomSay('stuck')
            // Tenta pular e se mexer
            bot.setControlState('jump', true)
            await bot.waitForTicks(10)
            bot.setControlState('jump', false)
            // Tenta andar um pouco para trás
            // ... (Lógica de destravamento simples)
            miningStuckCounter = 0
        }
    } else {
        // Verifica se realmente se mexeu
        if (bot.entity.position.distanceTo(prevPos) < 0.1) {
             // Cavou mas não andou?
        } else {
            miningStuckCounter = 0
        }
    }
  }

  async function handleReturnBase() {
    logger?.("[Miner] Subindo de volta para a base...")
    
    // === O SEGREDO DO RETORNO SEGURO ===
    // Criamos uma configuração de movimento específica para SUBIR escadas
    const returnMove = new Movements(bot)
    
    returnMove.canDig = false      // PROIBIDO quebrar blocos na volta (evita quebrar a escada)
    returnMove.allowParkour = true // PERMITIDO pular (para subir os degraus)
    returnMove.allowSprinting = true
    returnMove.canPlaceOn = false  // Não colocar blocos para não bloquear o caminho
    
    bot.pathfinder.setMovements(returnMove)

    try {
        await bot.pathfinder.goto(new goals.GoalNear(CONFIG.baseLocation.x, CONFIG.baseLocation.y, CONFIG.baseLocation.z, 1.5))
        currentState = STATE.DEPOSITING
    } catch (e) {
        bot.chat("Não consigo achar o caminho de volta! Estou preso ou a escada foi bloqueada.")
        // Em um bot avançado, aqui ativaríamos um modo "Rescue" para cavar para cima
        // Por enquanto, apenas para para não bugar
        setEnabled(false)
    }
  }

  async function handleDepositing() {
    logger?.("[Miner] Guardando itens...")
    
    // Filtro do que fica no inventário
    const itemsToKeep = (item) => {
        return item.name.includes('pickaxe') || 
               item.name.includes('sword') || 
               item.name.includes('torch') ||
               item.name.includes('bread') || 
               item.name.includes('steak') ||
               item.name.includes('helmet') ||
               item.name.includes('chestplate') ||
               item.name.includes('leggings') ||
               item.name.includes('boots')
    }

    // Usa o novo LogisticsManager (inverte a lógica: keep vs deposit)
    // O Logistics espera uma função filter que retorna TRUE para o que DEVE ser depositado
    const depositFilter = (item) => !itemsToKeep(item)

    await logistics.storeItemsInZone("estoque", depositFilter)
    
    if (!manager.hasPickaxe()) {
        currentState = STATE.WAITING_FOR_TOOL
    } else {
        randomSay('back')
        currentState = STATE.TRAVELING_TO_MINE 
    }
  }

  async function handleWaitingForTool() {
    logger?.("[Miner] Procurando picareta...")

    // Prioridade de ferramentas
    const tools = [
        { ids: [bot.registry.itemsByName.diamond_pickaxe.id], count: 1 },
        { ids: [bot.registry.itemsByName.iron_pickaxe.id], count: 1 },
        { ids: [bot.registry.itemsByName.stone_pickaxe.id], count: 1 },
        
    ]

    // Tenta pegar do estoque
    await logistics.retrieveItemsFromZone("estoque", tools)

    if (manager.hasPickaxe()) {
        bot.chat("Achei uma picareta! Voltando ao trabalho.")
        hasRequestedCraft = false 
        currentState = STATE.TRAVELING_TO_MINE
        return
    }

    // Se não achou, pede ajuda
    if (!hasRequestedCraft) {
        bot.chat("!jebona craftar picareta") 
        bot.chat("Estou sem ferramenta. Alguém faz uma pra mim?")
        hasRequestedCraft = true 
    }

    // Espera inteligente usando ticks
    await bot.waitForTicks(200) // Espera 10 segundos (20 ticks * 10)
  }

  return { setEnabled, setConfig }
}