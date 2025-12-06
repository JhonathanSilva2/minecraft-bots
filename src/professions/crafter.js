import pf from "mineflayer-pathfinder"
const { goals, Movements } = pf

export function createCrafter(bot, logger) {
  let enabled = false
  let isCrafting = false // Equivalente ao 'running' do estoquista, mas para operações pontuais

  // --- MÉTODOS PÚBLICOS (Interface) ---

  function setEnabled(value) {
    enabled = value
    if (!value) {
      stopCurrentActions()
    }
    bot.chat(value ? "Crafter ativado e aguardando pedidos!" : "Crafter desativado.")
  }

  function isEnabled() {
    return enabled
  }

  /**
   * Chamado externamente (pelo CommandHandler) para iniciar um trabalho.
   */
  async function processOrder(itemName, amount = 1) {
    if (!enabled) {
      bot.chat("Minha profissão de Crafter está desativada.")
      return
    }

    if (isCrafting) {
      bot.chat("Estou ocupado com outro pedido agora.")
      return
    }

    // Validação básica
    if (!bot.mcData) {
      bot.chat("Ainda estou carregando meus dados...")
      return
    }

    isCrafting = true
    logger(`[crafter] Iniciando pedido: ${amount}x ${itemName}`)

    try {
      // 1. Identificar Item e Receita
      const itemData = bot.registry.itemsByName[itemName]
      if (!itemData) {
        bot.chat(`Não conheço o item '${itemName}'.`)
        return
      }

      const recipes = bot.recipesFor(itemData.id, null, 1, null)
      if (recipes.length === 0) {
        bot.chat(`Não encontrei receita para ${itemName}.`)
        return
      }

      const recipe = recipes[0]
      bot.chat(`Receita encontrada para ${itemName}. Calculando materiais...`)

      // 2. Calcular Ingredientes
      const ingredientsNeeded = {}
      
      if (recipe.ingredients) {
        recipe.ingredients.forEach((id) => {
          const itemId = Array.isArray(id) ? id[0] : id
          ingredientsNeeded[itemId] = (ingredientsNeeded[itemId] || 0) + (1 * amount)
        })
      } else if (recipe.delta) {
        recipe.delta.forEach((stack) => {
          if (stack.count < 0) {
            ingredientsNeeded[stack.id] = (ingredientsNeeded[stack.id] || 0) + (Math.abs(stack.count) * amount)
          }
        })
      }

      logger(`[crafter] Preciso de: ${JSON.stringify(ingredientsNeeded)}`)

      // 3. Buscar Materiais (Baseado na Opção A: Scavenger)
      const success = await gatherIngredients(ingredientsNeeded)
      if (!success) {
        bot.chat("Não encontrei todos os materiais necessários no armazém.")
        return
      }

      // 4. Craftar (Workbench)
      await executeCraft(recipe, amount)

      // 5. Entregar (Base)
      await depositResult()

      bot.chat(`Pedido de ${itemName} concluído e guardado na base!`)

    } catch (err) {
      logger(`[crafter] Erro: ${err.message}`)
      bot.chat("Deu erro no processo de craft. Verifique o console.")
    } finally {
      isCrafting = false
      if (bot.currentWindow) bot.currentWindow.close()
    }
  }

  function stopCurrentActions() {
    if (bot.pathfinder?.stop) bot.pathfinder.stop()
    if (bot.currentWindow) bot.currentWindow.close()
    isCrafting = false
  }

  // --- FUNÇÕES INTERNAS (Lógica de Negócio) ---

  async function gatherIngredients(requiredItemsMap) {
    // Nota: Assume que bot.locations já está injetado e funcionando como no estoquista
    const armazemLoc = await bot.locations.get("armazem")
    if (!armazemLoc) throw new Error("Local 'armazem' não definido.")

    bot.chat("Indo ao armazém buscar materiais...")
    await moveTo(armazemLoc)

    const missing = { ...requiredItemsMap }
    const chests = findChestsInZone(armazemLoc)

    for (const chestBlock of chests) {
      if (!enabled || Object.keys(missing).length === 0) break

      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)
      
      try {
        const containerItems = window.containerItems()
        for (const reqIdStr of Object.keys(missing)) {
          const reqId = Number(reqIdStr)
          const qtyNeeded = missing[reqId]
          const itemInChest = containerItems.find((i) => i.type === reqId)

          if (itemInChest) {
            const qtyToWithdraw = Math.min(itemInChest.count, qtyNeeded)
            await window.withdraw(reqId, null, qtyToWithdraw)
            
            missing[reqId] -= qtyToWithdraw
            if (missing[reqId] <= 0) delete missing[reqId]
          }
        }
      } catch (err) {
        logger(`[crafter] Falha ao abrir baú: ${err.message}`)
      } finally {
        window.close()
      }
    }
    
    return Object.keys(missing).length === 0
  }

  async function executeCraft(recipe, amount) {
    const wbLoc = await bot.locations.get("workbench")
    if (!wbLoc) throw new Error("Local 'workbench' não definido.")

    bot.chat("Materiais em mãos. Indo para a bancada...")
    await moveTo(wbLoc)

    const tableBlock = bot.findBlock({
      matching: bot.registry.blocksByName["crafting_table"].id,
      maxDistance: 4,
    })

    if (!tableBlock) throw new Error("Não vejo a bancada na área da workbench!")

    await bot.craft(recipe, amount, tableBlock)
  }

  async function depositResult() {
    const baseLoc = await bot.locations.get("base")
    if (!baseLoc) throw new Error("Local 'base' não definido.")

    await moveTo(baseLoc)
    const chests = findChestsInZone(baseLoc)

    for (const chestBlock of chests) {
      if (bot.inventory.items().length === 0) break
      
      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)
      try {
        const items = bot.inventory.items()
        for (const item of items) {
          // Opcional: Filtros de segurança para não guardar equipamentos
          await window.deposit(item.type, item.metadata, item.count)
        }
      } catch (err) {
        // Ignora erro de baú cheio
      } finally {
        window.close()
      }
    }
  }

  // --- UTILITÁRIOS ---

  function findChestsInZone(loc) {
    const minX = loc.x; const maxX = loc.x + (loc.width || 1)
    const minZ = loc.z; const maxZ = loc.z + (loc.depth || 1)
    const minY = loc.y - 1; const maxY = loc.y + 2

    return bot.findBlocks({
        matching: [
            bot.registry.blocksByName['chest'].id,
            bot.registry.blocksByName['barrel']?.id
        ].filter(Boolean),
        maxDistance: 64, count: 200
    })
    .map(pos => bot.blockAt(pos))
    .filter(b => 
        b.position.x >= minX && b.position.x <= maxX &&
        b.position.z >= minZ && b.position.z <= maxZ &&
        b.position.y >= minY && b.position.y <= maxY
    )
    .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  }

  async function moveTo(loc) {
    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.canPlaceOn = false
    bot.pathfinder.setMovements(defaultMove)
    
    const goal = new goals.GoalNear(loc.x, loc.y, loc.z, 1)
    await bot.pathfinder.goto(goal)
  }

  // Retorna a "API" pública desta instância
  return { setEnabled, isEnabled, processOrder }
}