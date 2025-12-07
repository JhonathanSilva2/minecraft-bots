export function createCrafter(bot, logger) {
  let enabled = true
  let isWorking = false
  
  const queue = []

  const RAW_MATERIALS_TO_FETCH = [
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log',
    'crimson_stem', 'warped_stem', 'cobblestone', 'stone', 'sand', 'gravel', 'dirt', 'clay_ball', 'obsidian',
    'coal', 'charcoal', 'raw_iron', 'iron_ingot', 'raw_gold', 'gold_ingot', 'raw_copper', 'copper_ingot',
    'diamond', 'emerald', 'lapis_lazuli', 'redstone', 'quartz', 'netherite_scrap',
    'stick', 'string', 'leather', 'feather', 'bone', 'gunpowder', 'spider_eye', 'ender_pearl', 'blaze_rod',
    'slime_ball', 'ink_sac', 'rotten_flesh', 'wheat', 'sugar_cane', 'bamboo', 'cactus', 'pumpkin', 'melon_slice',
    'paper', 'oak_planks', 'glass'
  ]

  function setEnabled(value) {
    enabled = value
    // Apenas avisa mudanças de estado
    if (!value) bot.chat("craft off")
    if (value) processQueue()
  }

  function addOrder(itemOrList, amount = 1) {
    const candidates = Array.isArray(itemOrList) ? itemOrList : [itemOrList]
    
    const validCandidates = candidates.map(name => {
        const clean = name.toLowerCase().replace("minecraft:", "").replace(" ", "_")
        return bot.registry.itemsByName[clean] ? clean : null
    }).filter(Boolean)

    if (validCandidates.length === 0) {
        bot.chat("item invalido")
        return
    }

    queue.push({ candidates: validCandidates, amount })
    // Apenas confirma o pedido de forma simples
    bot.chat(`ok, vou fazer ${amount}x ${validCandidates[0]}`)
    
    if (enabled && !isWorking) processQueue()
  }

  async function processQueue() {
    if (!enabled || queue.length === 0 || isWorking) return

    isWorking = true
    const order = queue[0]
    let orderSuccess = false
    let craftedItemName = ""
    let stockedUp = false

    try {
        for (const itemCandidate of order.candidates) {
            logger(`[Crafter] Tentando craftar: ${itemCandidate}`)
            
            let success = await bot.crafting.craftRecursively(itemCandidate, order.amount)

            if (!success && !stockedUp) {
                // Avisa apenas ao buscar recursos
                bot.chat("pegando materiais...")
                
                const fetchList = RAW_MATERIALS_TO_FETCH
                    .map(name => bot.registry.itemsByName[name])
                    .filter(Boolean)
                    .map(item => ({ ids: [item.id], count: 64 }))

                await bot.logistics.retrieveItemsFromZone("estoque", fetchList)
                stockedUp = true 

                success = await bot.crafting.craftRecursively(itemCandidate, order.amount)
            }

            if (success) {
                orderSuccess = true
                craftedItemName = itemCandidate
                break
            }
        }

        if (orderSuccess) {
            // Apenas confirma sucesso
            bot.chat(`pronto, fiz ${order.amount}x ${craftedItemName}`)
            await bot.logistics.storeItemsInZone("base", (i) => i.name === craftedItemName)
        } else {
            // Avisa apenas falhas
            bot.chat("nao consegui fazer isso")
            await bot.logistics.storeItemsInZone("estoque", (i) => true) 
        }

        queue.shift()

    } catch (err) {
        logger(`[Crafter] Erro Fatal: ${err.message}`)
        console.error(err)
        bot.chat("deu erro")
        queue.shift()
    } finally {
        isWorking = false
        if (queue.length > 0) {
            setTimeout(() => processQueue(), 1000)
        }
        // Remove mensagem "Fila finalizada" - desnecessária
    }
  }

  return { setEnabled, addOrder }
}