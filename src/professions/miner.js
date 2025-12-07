import pathfinder from "mineflayer-pathfinder"
const { goals } = pathfinder
const { Movements } = pathfinder

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
  const logistics = bot.logistics
  
  if (!manager) throw new Error("MinerManager ausente!")
  if (!logistics) throw new Error("LogisticsManager ausente!")
  
  // Variáveis de Estado
  let enabled = false
  let currentState = STATE.IDLE
  let hasRequestedCraft = false 
  let miningStuckCounter = 0
  
  // MEMÓRIA: Guarda onde parou para não recomeçar do zero
  let lastMiningPos = null 

  const CONFIG = {
    baseLocation: null,
    mineStartLocation: null,
    direction: 'north',
    stoneLimit: 256,
    checkChestInterval: 10000 
  }

  // --- MENSAGENS ---
  const phrases = {
    start: ["Bora trabalhar!", "Hora de cavar buraco.", "Picareta na mão, partiu!"],
    full: ["Mochila pesada! Voltando.", "Não cabe mais nada.", "Estoque cheio!"],
    broken: ["Quebrou minha picareta...", "Ferramenta pifou.", "Preciso de outra picareta."],
    back: ["De volta à mina.", "Lá vamos nós de novo.", "Descendo!"],
    stuck: ["Acho que estou preso...", "Lugar apertado hein."],
    resume: ["Voltando para onde parei...", "Descendo até a última escavação."]
  }
  
  const randomSay = (cat) => {
    const list = phrases[cat]
    if (list) bot.chat(list[Math.floor(Math.random() * list.length)])
  }

  // --- CONTROLE ---
  function setEnabled(value) {
    enabled = value
    
    if (value) {
      if (!CONFIG.baseLocation) CONFIG.baseLocation = bot.entity.position.clone()
      
      // Define local de início apenas se não existir
      if (!CONFIG.mineStartLocation) {
        // Cálculo vetorial básico para frente (30 blocos)
        const offset = { x: 0, z: 0 }
        if (CONFIG.direction === 'north') offset.z = -30
        if (CONFIG.direction === 'south') offset.z = 30
        if (CONFIG.direction === 'east') offset.x = 30
        if (CONFIG.direction === 'west') offset.x = -30
        
        CONFIG.mineStartLocation = CONFIG.baseLocation.offset(offset.x, 0, offset.z)
      }
      
      // Se tivermos uma posição salva de antes, avisa
      if (lastMiningPos) randomSay('resume')
      else randomSay('start')

      currentState = STATE.TRAVELING_TO_MINE
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
    // Se mudar a configuração, reseta a memória de onde parou
    lastMiningPos = null 
  }

  // ==========================================
  // GAME LOOP
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
        logger?.(`[Miner] Erro: ${err.message}`)
        await bot.waitForTicks(20)
      }
      await bot.waitForTicks(10)
    }
  }

  // --- ESTADOS ---

  async function handleTravelToMine() {
    const move = new Movements(bot)
    move.canDig = false 
    move.allowParkour = true
    bot.pathfinder.setMovements(move)

    // LÓGICA DE RETOMADA: Se já cavamos antes, volte para lá. Se não, vá para o início.
    const target = lastMiningPos || CONFIG.mineStartLocation
    
    // Só anda se estiver longe (> 2 blocos)
    if (bot.entity.position.distanceTo(target) > 2) {
      // logger?.(`[Miner] Indo para ${lastMiningPos ? 'fundo da mina' : 'início da mina'}...`)
      await bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, 1.5))
    }
    
    currentState = STATE.MINING
  }

  async function handleMining() {
    // 1. Atualiza onde estamos (para poder voltar depois)
    lastMiningPos = bot.entity.position.clone()

    // 2. Checagens
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

    if (bot.entity.position.y <= -58) {
      bot.chat("Camada limite atingida! Voltando.")
      currentState = STATE.RETURNING_BASE
      // Resetar lastMiningPos aqui? Depende se você quer que ele pare ou tente outro lugar.
      return
    }

    // 3. Ação: Cavar Degrau
    const prevPos = bot.entity.position.clone()
    const success = await manager.digStaircaseStep(CONFIG.direction)
    
    // 4. Anti-Stuck
    if (!success) {
        miningStuckCounter++
        if (miningStuckCounter > 3) {
            randomSay('stuck')
            bot.setControlState('jump', true)
            await bot.waitForTicks(15)
            bot.setControlState('jump', false)
            miningStuckCounter = 0
        }
    } else {
        // Se cavou com sucesso, reseta contador
        miningStuckCounter = 0
    }
  }

  async function handleReturnBase() {
    // logger?.("[Miner] Voltando para base...")
    const returnMove = new Movements(bot)
    returnMove.canDig = false       // CRUCIAL: Não quebrar a escada na volta
    returnMove.allowParkour = true
    returnMove.allowSprinting = true
    returnMove.canPlaceOn = false   
    bot.pathfinder.setMovements(returnMove)

    try {
        await bot.pathfinder.goto(new goals.GoalNear(CONFIG.baseLocation.x, CONFIG.baseLocation.y, CONFIG.baseLocation.z, 1.5))
        currentState = STATE.DEPOSITING
    } catch (e) {
        bot.chat("Erro ao voltar pra casa. Caminho bloqueado?")
        setEnabled(false)
    }
  }

  async function handleDepositing() {
    // logger?.("[Miner] Depositando...")
    
    const itemsToKeep = (item) => {
        return item.name.includes('pickaxe') || 
               item.name.includes('sword') || 
               item.name.includes('torch') ||
               item.name.includes('bread') || 
               item.name.includes('cooked_beef') || // Correção do nome do steak
               item.name.includes('helmet') ||
               item.name.includes('chestplate') ||
               item.name.includes('leggings') ||
               item.name.includes('boots')
    }

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
    // CORREÇÃO: Verifica ferramenta por prioridade, UM POR VEZ
    const pickaxeTiers = ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe']
    
    let gotTool = false

    // Tenta pegar a melhor disponível
    for (const pickName of pickaxeTiers) {
        const itemData = bot.registry.itemsByName[pickName]
        if (!itemData) continue

        // Pede para o Logistic pegar APENAS esse tipo
        const req = [{ ids: [itemData.id], count: 1 }]
        
        // Retrieve retorna true se conseguiu pegar tudo que foi pedido
        const success = await logistics.retrieveItemsFromZone("estoque", req)
        
        if (success) {
            gotTool = true
            break // Já pegou uma, para de procurar
        }
    }

    if (gotTool || manager.hasPickaxe()) {
        bot.chat("Consegui uma picareta!")
        hasRequestedCraft = false 
        currentState = STATE.TRAVELING_TO_MINE
        return
    }

    // Se não achou NENHUMA
    if (!hasRequestedCraft) {
        bot.chat("!jebona craftar picareta") 
        bot.chat("Sem picaretas no estoque. Alguém ajuda?")
        hasRequestedCraft = true 
    }

    await bot.waitForTicks(100) // 5 segundos
  }

  return { setEnabled, setConfig }
}