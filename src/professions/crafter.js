import pf from "mineflayer-pathfinder"
import prismarineItem from 'prismarine-item' // <-- NOVO: Importa o loader da classe Item
const { goals, Movements } = pf

// ============================================
// SISTEMA DE DEBUG MODULAR
// ============================================
const DEBUG_MODE = true

function debugLog(section, message, data = null) {
  if (!DEBUG_MODE) return
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1)
  console.log(`[${timestamp}] [DEBUG:${section}] ${message}`)
  if (data !== null) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function debugRecipe(recipe, itemName) {
  if (!DEBUG_MODE) return
  debugLog('RECIPE', `Analisando receita de: ${itemName}`)
  
  // Detecção mais robusta para objetos manuais
  const type = recipe.ingredients ? 'ingredients' : 
               recipe.inShape ? 'inShape' : 'delta/other'
               
  debugLog('RECIPE-TYPE', `Tipo de receita detectado: ${type}`)
  
  if (recipe.inShape) {
    debugLog('RECIPE-INSHAPE', 'Estrutura do inShape:', recipe.inShape)
  }
}

function debugRawIds(rawIds) {
  if (!DEBUG_MODE) return
  debugLog('RAW-IDS', `Total de IDs coletados (com nulls): ${rawIds.length}`)
  // ... (Log mantido simples para economizar espaço visual) ...
}

function debugCandidates(candidates, originalItem) {
  if (!DEBUG_MODE) return
  debugLog('CANDIDATES', `Original: ${JSON.stringify(originalItem)} -> Ops: ${candidates.length}`)
}

// ============================================
// MAPA DE PRIORIDADES
// ============================================
const TOOL_TIERS = {
  axe: ["diamond_axe", "iron_axe", "stone_axe", "wooden_axe", "golden_axe"],
  pickaxe: ["diamond_pickaxe", "iron_pickaxe", "stone_pickaxe", "wooden_pickaxe", "golden_pickaxe"],
  shovel: ["diamond_shovel", "iron_shovel", "stone_shovel", "wooden_shovel", "golden_shovel"],
  hoe: ["diamond_hoe", "iron_hoe", "stone_hoe", "wooden_hoe", "golden_hoe"],
  sword: ["diamond_sword", "iron_sword", "stone_sword", "wooden_sword", "golden_sword"],
}

export function createCrafter(bot, logger) {
  let enabled = false
  let isCrafting = false

  // --- CORREÇÃO DE ACESSO A CLASSE ITEM ---
  // Cria a classe Item uma única vez usando o loader
  const ItemClass = prismarineItem(bot.version) 
  // ---------------------------------------

  function setEnabled(value) {
    enabled = value
    if (!value) stopCurrentActions()
    bot.chat(value ? "Crafter ativado!" : "Crafter pausado.")
  }

  function isEnabled() { return enabled }

  async function processOrder(itemName, amount = 1) {
    if (!enabled) return bot.chat("Crafter desligado.")
    if (isCrafting) return bot.chat("Ocupado.")
    if (!bot.mcData) return bot.chat("Carregando dados...")

    isCrafting = true
    let cleanName = itemName.toLowerCase().replace("minecraft:", "").replace(" ", "_")
    logger(`[crafter] Pedido inicial: ${amount}x ${cleanName}`)

    try {
      if (TOOL_TIERS[cleanName]) {
        bot.chat(`Você pediu '${cleanName}'. Vou tentar fazer o melhor possível...`)
        const tierList = TOOL_TIERS[cleanName]
        let craftedSomething = false

        for (const tierItem of tierList) {
          logger(`[crafter] Tentando tier: ${tierItem}`)
          const success = await attemptCraftSequence(tierItem, amount, true)
          if (success) {
            bot.chat(`Sucesso! Fiz ${amount}x ${tierItem}.`)
            craftedSomething = true
            break
          }
        }
        if (!craftedSomething) bot.chat(`Não consegui fazer nenhum tipo de ${cleanName}.`)
      } else {
        await attemptCraftSequence(cleanName, amount, false)
      }
    } catch (err) {
      logger(`[crafter] Erro: ${err.message}`)
      bot.chat("Erro crítico. Veja console.")
      console.error(err)
    } finally {
      isCrafting = false
      if (bot.currentWindow) bot.currentWindow.close()
    }
  }

  async function attemptCraftSequence(targetItemName, amount, isTierAttempt) {
      const itemData = bot.registry.itemsByName[targetItemName]
      
      if (!itemData) {
        if (!isTierAttempt) bot.chat(`Item desconhecido: ${targetItemName}`)
        return false
      }

      // 1. Pegamos os dados RAW do mcData
      const rawRecipes = bot.mcData.recipes[itemData.id]
      
      if (!rawRecipes || rawRecipes.length === 0) {
        if (!isTierAttempt) bot.chat(`Sem receita para ${targetItemName}.`)
        return false
      }

      for (const rawRecipe of rawRecipes) {
        try {
            // Usamos a receita RAW para calcular requisitos
            const requirements = calculateRequirements(rawRecipe, amount, targetItemName)
            
            if (!requirements || requirements.length === 0) continue

            const success = await gatherIngredients(requirements)
            
            if (success) {
               await executeCraft(rawRecipe, amount)
               await depositResult()
               if (!isTierAttempt) bot.chat(`Pronto! ${amount}x ${targetItemName} feito.`)
               return true
            }
        } catch (e) {
            logger(`[crafter] Erro na receita de ${targetItemName}: ${e.message}`)
            console.error(e) 
            continue
        }
      }
      
      if (!isTierAttempt) bot.chat(`Faltam materiais para ${targetItemName}.`)
      return false
  }

  function stopCurrentActions() {
    if (bot.pathfinder?.stop) bot.pathfinder.stop()
    if (bot.currentWindow) bot.currentWindow.close()
    isCrafting = false
  }

  // --- LÓGICA DE CÁLCULO ---

  function calculateRequirements(recipe, amount, itemName = 'unknown') {
    debugRecipe(recipe, itemName)
    const rawIds = []

    // 1. Coleta os dados brutos da receita
    if (recipe.ingredients) {
      debugLog('COLETA', 'Usando recipe.ingredients')
      recipe.ingredients.forEach(i => { if (i !== null && i !== undefined) rawIds.push(i) })
    } 
    else if (recipe.inShape) {
      debugLog('COLETA', 'Usando recipe.inShape')
      recipe.inShape.forEach(row => {
        if (Array.isArray(row)) {
          row.forEach(item => {
             if (item !== null && item !== undefined) {
                 rawIds.push(typeof item === 'object' ? item.id : item)
             }
          })
        }
      })
    }
    
    // FILTRO CRÍTICO: Ignora IDs inválidos/negativos (ID DUMMY -1)
    const finalCleanIds = []
    rawIds.forEach(id => {
        let itemId = id
        
        if (Array.isArray(id)) itemId = id[0] 
        if (typeof id === 'object' && id !== null) itemId = id.id || -1
        
        if (typeof itemId === 'number' && itemId > 0) {
            finalCleanIds.push(itemId)
        }
    })

    debugRawIds(finalCleanIds)

    const finalList = []
    const counts = {}
    
    finalCleanIds.forEach(id => {
        counts[id] = (counts[id] || 0) + 1
    })

    for (const [id, count] of Object.entries(counts)) {
        finalList.push({ ids: [parseInt(id)], count: count * amount })
    }
    
    debugLog('RESULTADO', `FinalList (${finalList.length} tipos de item):`, finalList)
    
    return finalList.map(req => ({ ...req, count: req.count }))
  }

  async function gatherIngredients(requirementsList) {
    // ... (mantido inalterado) ...
    const estoqueLoc = await bot.locations.get("estoque")
    if (!estoqueLoc) throw new Error("Local 'estoque' não definido.")

    if (bot.entity.position.distanceTo(new pf.goals.GoalNear(estoqueLoc.x, estoqueLoc.y, estoqueLoc.z, 1)) > 5) {
        await moveTo(estoqueLoc)
    }

    const missing = requirementsList.map(req => ({ ...req })) 
    const chests = findChestsInZone(estoqueLoc)

    for (const chestBlock of chests) {
      if (!enabled || missing.length === 0) break
      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)
      try {
        const containerItems = window.containerItems()
        for (let i = missing.length - 1; i >= 0; i--) {
          const req = missing[i]
          const itemInChest = containerItems.find(item => req.ids.includes(item.type)) // Simplificado match
          if (itemInChest) {
            const qtyToWithdraw = Math.min(itemInChest.count, req.count)
            await window.withdraw(itemInChest.type, null, qtyToWithdraw)
            req.count -= qtyToWithdraw
            if (req.count <= 0) missing.splice(i, 1)
          }
        }
      } catch (err) { logger(`[crafter] Erro baú: ${err.message}`) } 
      finally { window.close() }
    }
    
    if (missing.length > 0) {
        logger(`[crafter] Faltam materiais.`)
        return false
    }
    
    // Verificação de inventário
    for (const req of requirementsList) {
        const count = bot.inventory.items().filter(i => req.ids.includes(i.type)).reduce((a,b)=>a+b.count,0)
        if (count < req.count) return false
    }
    logger(`[crafter] ✅ Todos os materiais estão no inventário!`)
    return true
  }

  // --- O CORAÇÃO DA CORREÇÃO ---

  function normalizeRecipeForMineflayer(rawRecipe) {
      // Usamos JSON.parse(JSON.stringify) para garantir uma cópia profunda (Deep Copy)
      const safeRecipe = JSON.parse(JSON.stringify(rawRecipe))

      // Usamos o ID -1, que é o padrão interno do prismarine-recipe para slots vazios.
      const DUMMY_SLOT = { id: -1, count: 0 } 

      // 1. Corrige inShape (Receita com forma)
      if (safeRecipe.inShape) {
          safeRecipe.inShape = safeRecipe.inShape.map(row => {
              if (!Array.isArray(row)) return row
              return row.map(item => {
                  if (item === null) return DUMMY_SLOT // <-- Substitui NULL por DUMMY
                  
                  if (typeof item === 'number') {
                      return { id: item, count: 1 }
                  }
                  return item
              })
          })
      }

      // 2. Corrige ingredients (Receita sem forma)
      if (safeRecipe.ingredients) {
          safeRecipe.ingredients = safeRecipe.ingredients.map(item => {
              if (item === null) return DUMMY_SLOT
              if (typeof item === 'number') return { id: item, count: 1 }
              return item
          })
      }

      // 3. Injeta propriedades de resultado
      safeRecipe.result = { 
          id: rawRecipe.result.id, 
          count: rawRecipe.result.count || 1 
      };

      return safeRecipe
  }

  async function executeCraft(rawRecipe, amount) {
    const wbLoc = await bot.locations.get("workbench")
    if (!wbLoc) throw new Error("Local 'workbench' não definido.")

    await moveTo(wbLoc)
    const tableBlock = bot.findBlock({
      matching: bot.registry.blocksByName["crafting_table"].id,
      maxDistance: 5,
    })
    if (!tableBlock) throw new Error("Bancada não encontrada!")
    
    // 1. Normaliza a receita
    const finalRecipe = normalizeRecipeForMineflayer(rawRecipe)
    
    // ========================================
    // CORREÇÃO CRÍTICA: INJETAR ITEM DUMMY
    // ========================================
    const DUMMY_ID = -1 
    const DUMMY_COUNT = 64
    const DUMMY_SLOT = 1 // Slot arbitrário seguro (diferente de 0/mão principal)

    // Usa a classe Item corrigida que foi inicializada em createCrafter
    // Se a ItemClass não estiver definida, algo deu errado na inicialização
    if (!ItemClass || typeof ItemClass !== 'function') throw new Error("Erro interno: A classe Item não foi inicializada corretamente.")
    
    // Cria o item dummy
    const DUMMY_ITEM = new ItemClass(DUMMY_ID, DUMMY_COUNT, null) 
    
    // Usa o método updateSlot para simular a presença do item no inventário
    bot.inventory.updateSlot(DUMMY_SLOT, DUMMY_ITEM)
    
    logger(`[crafter] Executando craft com injeção de item dummy...`)
    
    try {
        await bot.craft(finalRecipe, amount, tableBlock)
    } finally {
        // Remove o item dummy (passando null) do inventário simulado
        bot.inventory.updateSlot(DUMMY_SLOT, null) 
    }
  }

  async function depositResult() {
    const baseLoc = await bot.locations.get("base")
    if (!baseLoc) throw new Error("Local 'base' não definido.")
    await moveTo(baseLoc)
    const chests = findChestsInZone(baseLoc)
    // ... lógica de depósito padrão ...
    for (const chest of chests) {
        if(bot.inventory.items().length === 0) break
        const w = await bot.openContainer(chest)
        try { 
            for(const i of bot.inventory.items()) await w.deposit(i.type, null, i.count)
        } catch(e){} finally { w.close() }
    }
  }

  // --- UTILITÁRIOS ---
  function findChestsInZone(loc) {
    const minX = loc.x; const maxX = loc.x + (loc.width || 1)
    const minZ = loc.z; const maxZ = loc.z + (loc.depth || 1)
    return bot.findBlocks({
        matching: [bot.registry.blocksByName['chest'].id, bot.registry.blocksByName['barrel']?.id].filter(Boolean),
        maxDistance: 64, count: 200
    }).map(pos => bot.blockAt(pos)).filter(b => 
        b.position.x >= minX && b.position.x <= maxX &&
        b.position.z >= minZ && b.position.z <= maxZ
    ).sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  }

  async function moveTo(loc) {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.canPlaceOn = false
    bot.pathfinder.setMovements(defaultMove)
    const goal = new goals.GoalNear(loc.x, loc.y, loc.z, 1)
    await bot.pathfinder.goto(goal)
  }

  return { setEnabled, isEnabled, processOrder }
}