import pf from "mineflayer-pathfinder"
import prismarineItem from 'prismarine-item' 

const { goals } = pf

// LISTA DE ITENS QUE CAUSAM LOOP (Matérias-primas que têm receitas reversíveis de bloco)
// Se o bot precisar desses itens, ele DEVE falhar o craft e ir buscar no baú/estoque.
const BLOCK_RECURSION_FOR = new Set([
    'diamond', 
    'iron_ingot', 
    'gold_ingot', 
    'copper_ingot',
    'emerald', 
    'lapis_lazuli', 
    'redstone', 
    'coal', 
    'netherite_ingot',
    'slime_ball',
    'wheat', // Evita loop com Hay Bale
    'bone_meal', // Evita loop com Bone Block
    'iron_nugget', // Evita loop com Ingot
    'gold_nugget',
    'bamboo', // Evita loop com Bamboo Block/Planks em versões novas
    'glowstone_dust'
])

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
  // LÓGICA RECURSIVA (RESOLUÇÃO DE DEPENDÊNCIAS)
  // ======================================================

  async craftRecursively(itemName, count) {
    const { bot, logger } = this
    
    // --- CORREÇÃO DO LOOP INFINITO ---
    // Se o item for uma matéria-prima que causa loop (ex: diamante),
    // retornamos false imediatamente para forçar a busca no estoque.
    if (BLOCK_RECURSION_FOR.has(itemName)) {
        // Verifica se JÁ TEMOS no inventário (caso tenhamos, não é craft, é uso)
        const itemData = bot.registry.itemsByName[itemName]
        if (itemData) {
            const currentCount = this.countInInventory([itemData.id])
            if (currentCount >= count) return true
        }
        // Se não tem, retorna false (não tente craftar Diamante a partir de Bloco de Diamante)
        return false 
    }
    // ----------------------------------

    this.recursionDepth++

    if (this.recursionDepth > 10) {
        this.recursionDepth-- // Importante decrementar antes do throw para não travar futuras chamadas se o catch for externo
        throw new Error(`Profundidade máxima de craft excedida para ${itemName} (loop infinito?)`)
    }

    try {
        const itemData = bot.registry.itemsByName[itemName]
        if (!itemData) throw new Error(`Item desconhecido: ${itemName}`)

        // 1. Verifica se já temos o item pronto
        const currentCount = this.countInInventory([itemData.id])
        if (currentCount >= count) {
            return true 
        }

        const needed = count - currentCount
        
        // 2. Busca receitas
        const recipes = this.getRecipes(itemName)
        if (!recipes) {
            return false 
        }

        // 3. Tenta cada receita possível
        for (const recipe of recipes) {
            const outputCount = recipe.result.count
            const craftsNeeded = Math.ceil(needed / outputCount)
            
            const requirements = this.calculateRequirements(recipe, craftsNeeded)
            let ingredientsOK = true

            // Verifica cada ingrediente
            for (const req of requirements) {
                const currentIngCount = this.countInInventory(req.ids)
                
                if (currentIngCount < req.count) {
                    const missingIng = req.count - currentIngCount
                    
                    // Pega o nome do primeiro item aceito
                    const ingName = bot.registry.items[req.ids[0]].name
                    
                    // Evita log excessivo se for matéria prima bloqueada
                    if (!BLOCK_RECURSION_FOR.has(ingName)) {
                        logger?.(`[CraftManager] Falta ${missingIng}x ${ingName} para fazer ${itemName}. Tentando criar...`)
                    }
                    
                    // --- RECURSIVIDADE ---
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
  // EXECUÇÃO TÉCNICA 
  // ======================================================

  async craft(rawRecipe, amount, workbenchLocationName = "workbench") {
      const { bot, logger } = this

      // 1. Ir até a bancada (apenas se necessário e se location existir)
      if (workbenchLocationName && bot.locations) {
          const wbLoc = await bot.locations.get(workbenchLocationName)
          // Só vai até a mesa se ela for realmente necessária ou se estivermos longe
          // (Lógica simplificada: sempre tenta ir se tiver location)
          if (wbLoc) {
            if (bot.movement) await bot.movement.gotoLocation(workbenchLocationName)
            else {
                // Fallback simples
                const goal = new goals.GoalNear(wbLoc.x, wbLoc.y, wbLoc.z, 1.5)
                await bot.pathfinder.goto(goal)
            }
          }
      }

      // 2. Encontrar o bloco físico
      const tableBlock = bot.findBlock({ 
          matching: (blk) => blk.name === 'crafting_table',
          maxDistance: 6 
      })

      // 3. Preparar Receita
      const finalRecipe = this._normalizeRecipeForMineflayer(rawRecipe)
      
      // Slot Hack para Mineflayer não reclamar de inventário vazio
      const DUMMY_SLOT = 36 // Slot do inventário principal (evita hotbar)
      const DUMMY_ITEM = new this.ItemClass(-1, 64, null) 

      // Nota: Usar updateSlot com item ID -1 pode ser arriscado em alguns servidores,
      // mas funciona bem para "enganar" validações client-side do mineflayer antigo.
      // Se der erro de "window not found", remova essa parte do dummy.
      bot.inventory.updateSlot(DUMMY_SLOT, DUMMY_ITEM)
      
      try {
          await bot.craft(finalRecipe, amount, tableBlock || null)
          logger?.(`[CraftManager] Craft concluído: ${amount}x loops da receita.`)
      } catch (err) {
          logger?.(`[CraftManager] Erro no bot.craft: ${err.message}`)
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