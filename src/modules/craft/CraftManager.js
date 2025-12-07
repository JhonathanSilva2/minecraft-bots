import pf from "mineflayer-pathfinder"
import prismarineItem from 'prismarine-item' 

const { goals } = pf

// Matérias-primas que não devem ser craftadas recursivamente para evitar loops
// Ex: Não tentar fazer Diamante a partir de Bloco de Diamante se o objetivo é ter Diamante
const BLOCK_RECURSION_FOR = new Set([
    'diamond', 'iron_ingot', 'gold_ingot', 'copper_ingot', 'emerald', 
    'lapis_lazuli', 'redstone', 'coal', 'netherite_ingot', 'slime_ball',
    'wheat', 'bone_meal', 'iron_nugget', 'gold_nugget', 'bamboo', 'glowstone_dust'
])

// Prioridade de combustíveis para usar na fornalha
const FUEL_PRIORITY = [
    'coal', 'charcoal', 'lava_bucket', 'blaze_rod', 'coal_block', 
    'dried_kelp_block', 'log', 'planks', 'stick'
]

export default class CraftManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
    this.ItemClass = null
    this.recursionDepth = 0 
  }

  init() {
    if (this.bot.version) {
      this.ItemClass = prismarineItem(this.bot.version)
      this.logger?.("[CraftManager] ItemClass carregada.")
    }
  }

  // ======================================================
  // SISTEMA DE FUNDIÇÃO (FORNALHA)
  // ======================================================

  /**
   * Gerencia todo o ciclo de uso de uma fornalha:
   * Encontrar -> Abastecer (Item + Combustível) -> Aguardar -> Coletar.
   */
  async smeltItem(itemName, count = 1) {
    const { bot, logger } = this

    // 1. Validação e busca de receita de fundição
    const targetItem = bot.registry.itemsByName[itemName]
    if (!targetItem) throw new Error(`Item desconhecido: ${itemName}`)

    const allRecipes = bot.mcData.recipes[targetItem.id] || []
    const smeltingRecipe = allRecipes.find(r => !r.inShape && r.ingredients && r.ingredients.length === 1)

    if (!smeltingRecipe) {
        throw new Error(`Não encontrei receita de fundição para ${itemName}`)
    }

    const inputId = Array.isArray(smeltingRecipe.ingredients[0]) 
        ? smeltingRecipe.ingredients[0][0] 
        : smeltingRecipe.ingredients[0]
    
    const inputItemData = bot.registry.items[inputId]

    // 2. Verificação de recursos (Input e Combustível)
    const inputCount = this.countInInventory([inputId])
    if (inputCount < count) {
        throw new Error(`Falta ${inputItemData.name} para fundir. Tenho: ${inputCount}, Preciso: ${count}`)
    }

    const fuel = this._getBestFuel()
    if (!fuel) {
        throw new Error("Sem combustível no inventário.")
    }

    // 3. Localização e Movimento
    const furnaceBlock = bot.findBlock({
        matching: bot.registry.blocksByName.furnace.id,
        maxDistance: 32
    })

    if (!furnaceBlock) throw new Error("Nenhuma fornalha encontrada por perto.")

    if (bot.movement) {
        await bot.movement.goToBlock(furnaceBlock)
    } else {
        const { goals } = await import("mineflayer-pathfinder")
        await bot.pathfinder.goto(new goals.GoalNear(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 1.5))
    }

    // 4. Operação da Fornalha
    const furnace = await bot.openFurnace(furnaceBlock)
    
    try {
        // Limpa input anterior se for diferente
        if (furnace.inputItem && furnace.inputItem.type !== inputId) {
             await furnace.takeInput()
        }
        
        // Abastece a fornalha
        await furnace.putInput(inputId, null, count)

        if (furnace.fuelItem && furnace.fuelItem.type !== fuel.type) {
            await furnace.takeFuel()
        }
        
        await furnace.putFuel(fuel.type, null, Math.min(fuel.count, 64))

        logger?.("[CraftManager] Fundindo itens...")

        // 5. Monitoramento do processo (Event Loop)
        await new Promise((resolve, reject) => {
            let collectedCount = 0
            
            const onUpdate = async () => {
                // Coleta produto se disponível
                if (furnace.outputItem && furnace.outputItem.count > 0) {
                    try {
                        const taken = await furnace.takeOutput()
                        if (taken) collectedCount += taken.count
                    } catch (err) {}
                }

                // Reabastece combustível se necessário
                if (furnace.fuel === 0 && furnace.fuelItem === null && collectedCount < count) {
                    const newFuel = this._getBestFuel()
                    if (newFuel) {
                        furnace.putFuel(newFuel.type, null, 1).catch(() => {})
                    } else {
                        cleanup()
                        reject(new Error("Acabou o combustível!"))
                    }
                }

                // Finaliza se completou
                if (collectedCount >= count) {
                    cleanup()
                    resolve()
                }
                
                // Erro: Input acabou antes de terminar
                if (!furnace.inputItem && collectedCount < count) {
                     if (!furnace.outputItem) {
                        cleanup()
                        resolve() // Retorna o que conseguiu
                     }
                }
            }

            const cleanup = () => {
                furnace.removeListener('update', onUpdate)
            }

            furnace.on('update', onUpdate)
        })

    } catch (err) {
        logger?.(`[CraftManager] Erro na fornalha: ${err.message}`)
        throw err
    } finally {
        furnace.close()
    }
  }

  _getBestFuel() {
    const items = this.bot.inventory.items()
    for (const fuelName of FUEL_PRIORITY) {
        const found = items.find(i => i.name === fuelName || i.name.includes(fuelName))
        if (found) return found
    }
    return null
  }

  // ======================================================
  // LÓGICA RECURSIVA (RESOLUÇÃO DE DEPENDÊNCIAS)
  // ======================================================

  /**
   * Tenta craftar um item e todos os seus pré-requisitos.
   * Ex: Para craftar uma bancada, primeiro crafta as tábuas de madeira necessárias.
   */
  async craftRecursively(itemName, count) {
    const { bot, logger } = this
    
    // Impede loop infinito em receitas reversíveis (Bloco <-> Minério)
    if (BLOCK_RECURSION_FOR.has(itemName)) {
        const itemData = bot.registry.itemsByName[itemName]
        if (itemData) {
            const currentCount = this.countInInventory([itemData.id])
            if (currentCount >= count) return true
        }
        return false 
    }

    this.recursionDepth++
    if (this.recursionDepth > 10) {
        this.recursionDepth-- 
        throw new Error(`Profundidade limite excedida para ${itemName}`)
    }

    try {
        const itemData = bot.registry.itemsByName[itemName]
        if (!itemData) throw new Error(`Item desconhecido: ${itemName}`)

        // Verifica inventário atual
        const currentCount = this.countInInventory([itemData.id])
        if (currentCount >= count) return true 

        const needed = count - currentCount
        const recipes = this.getRecipes(itemName)
        if (!recipes) return false 

        // Tenta encontrar uma receita viável
        for (const recipe of recipes) {
            const outputCount = recipe.result.count
            const craftsNeeded = Math.ceil(needed / outputCount)
            const requirements = this.calculateRequirements(recipe, craftsNeeded)
            let ingredientsOK = true

            // Verifica e prepara cada ingrediente
            for (const req of requirements) {
                const currentIngCount = this.countInInventory(req.ids)
                
                if (currentIngCount < req.count) {
                    const missingIng = req.count - currentIngCount
                    const ingName = bot.registry.items[req.ids[0]].name
                    
                    if (!BLOCK_RECURSION_FOR.has(ingName)) {
                        logger?.(`[CraftManager] Criando sub-item: ${missingIng}x ${ingName}`)
                    }
                    
                    // Chamada Recursiva
                    const subSuccess = await this.craftRecursively(ingName, missingIng)
                    if (!subSuccess) {
                        ingredientsOK = false
                        break 
                    }
                }
            }

            if (ingredientsOK) {
                await this.craft(recipe, craftsNeeded, "workbench")
                return true
            }
        }

        return false 

    } finally {
        this.recursionDepth--
    }
  }

  // ======================================================
  // EXECUÇÃO TÉCNICA (INTERAÇÃO COM O MUNDO)
  // ======================================================

  async craft(rawRecipe, amount, workbenchLocationName = "workbench") {
      const { bot, logger } = this

      // Move-se para a bancada se necessário
      if (workbenchLocationName && bot.locations) {
          const wbLoc = await bot.locations.get(workbenchLocationName)
          if (wbLoc) {
            if (bot.movement) await bot.movement.gotoLocation(workbenchLocationName)
            else {
                const goal = new goals.GoalNear(wbLoc.x, wbLoc.y, wbLoc.z, 1.5)
                await bot.pathfinder.goto(goal)
            }
          }
      }

      const tableBlock = bot.findBlock({ 
          matching: (blk) => blk.name === 'crafting_table',
          maxDistance: 6 
      })

      const finalRecipe = this._normalizeRecipeForMineflayer(rawRecipe)
      
      // Slot Hack: Evita erros do Mineflayer ao manipular inventário vazio
      const DUMMY_SLOT = 36 
      const DUMMY_ITEM = new this.ItemClass(-1, 64, null) 
      bot.inventory.updateSlot(DUMMY_SLOT, DUMMY_ITEM)
      
      try {
          await bot.craft(finalRecipe, amount, tableBlock || null)
          logger?.(`[CraftManager] Craftado: ${amount}x`)
      } catch (err) {
          logger?.(`[CraftManager] Erro técnico: ${err.message}`)
          throw err
      } finally {
          bot.inventory.updateSlot(DUMMY_SLOT, null) 
      }
  }

  // ======================================================
  // UTILITÁRIOS
  // ======================================================

  countInInventory(ids) {
    return this.bot.inventory.items()
      .filter(i => ids.includes(i.type))
      .reduce((acc, i) => acc + i.count, 0)
  }

  getRecipes(itemName) {
    const itemData = this.bot.registry.itemsByName[itemName]
    if (!itemData) return null
    const raw = this.bot.mcData.recipes[itemData.id]
    return (raw && raw.length) ? raw : null
  }

  calculateRequirements(rawRecipe, multiplier) {
    const rawIds = []
    
    if (rawRecipe.ingredients) {
      rawRecipe.ingredients.forEach(i => { if (i) rawIds.push(i) })
    } else if (rawRecipe.inShape) {
      rawRecipe.inShape.forEach(row => {
        if (Array.isArray(row)) row.forEach(i => { if (i) rawIds.push(typeof i === 'object' ? i.id : i) })
      })
    }
    
    const counts = {}
    rawIds.forEach(id => {
        let itemId = (Array.isArray(id) ? id[0] : (typeof id === 'object' ? id.id : id))
        if (itemId > 0) counts[itemId] = (counts[itemId] || 0) + 1
    })

    const reqs = []
    for (const [id, c] of Object.entries(counts)) {
        reqs.push({ ids: [parseInt(id)], count: c * multiplier })
    }
    return reqs
  }

  _normalizeRecipeForMineflayer(rawRecipe) {
      const safeRecipe = JSON.parse(JSON.stringify(rawRecipe))
      const DUMMY = { id: -1, count: 0 }
      const norm = (i) => (i === null ? DUMMY : (typeof i === 'number' ? { id: i, count: 1 } : i))

      if (safeRecipe.inShape) safeRecipe.inShape = safeRecipe.inShape.map(row => Array.isArray(row) ? row.map(norm) : row)
      if (safeRecipe.ingredients) safeRecipe.ingredients = safeRecipe.ingredients.map(norm)
      
      safeRecipe.result = { id: rawRecipe.result.id, count: rawRecipe.result.count || 1 }
      return safeRecipe
  }
}