export function createCrafter(bot, logger) {
  let enabled = true
  let isWorking = false
  
  // A fila agora armazena objetos com { candidates: string[], amount: number }
  const queue = []

  // Lista de materiais básicos para buscar no baú caso falhe o craft
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
    bot.chat(value ? "Crafter ligado." : "Crafter desligado.")
    if (value) processQueue()
  }

  // Aceita item único (string) ou lista de prioridade (array de strings)
  function addOrder(itemOrList, amount = 1) {
    const candidates = Array.isArray(itemOrList) ? itemOrList : [itemOrList]
    
    // Filtra apenas itens válidos no registry para evitar erros
    const validCandidates = candidates.map(name => {
        const clean = name.toLowerCase().replace("minecraft:", "").replace(" ", "_")
        return bot.registry.itemsByName[clean] ? clean : null
    }).filter(Boolean)

    if (validCandidates.length === 0) {
        bot.chat(`Nenhum item válido encontrado para craftar.`)
        return
    }

    queue.push({ candidates: validCandidates, amount })
    bot.chat(`Fila: Tentar fazer ${validCandidates[0]} (ou inferiores). Posição: ${queue.length}`)
    
    if (enabled && !isWorking) processQueue()
  }

  async function processQueue() {
    if (!enabled || queue.length === 0 || isWorking) return

    isWorking = true
    const order = queue[0] // Pega a ordem atual sem remover
    let orderSuccess = false
    let craftedItemName = ""
    let stockedUp = false // Flag para controlar ida ao baú

    try {
        // Loop de prioridade: Tenta do melhor item para o pior da lista
        for (const itemCandidate of order.candidates) {
            logger(`[Crafter] Tentando craftar: ${itemCandidate}`)
            
            // 1. Tentativa Inicial (usando o que tem no inventário)
            let success = await bot.crafting.craftRecursively(itemCandidate, order.amount)

            // 2. Se falhar e ainda não fomos ao baú nesta ordem, busca recursos
            if (!success && !stockedUp) {
                bot.chat(`Sem recursos para ${itemCandidate}. Buscando no estoque...`)
                
                // Monta lista de busca com 64 de cada material base
                const fetchList = RAW_MATERIALS_TO_FETCH
                    .map(name => bot.registry.itemsByName[name])
                    .filter(Boolean)
                    .map(item => ({ ids: [item.id], count: 64 }))

                // Busca itens
                await bot.movement.retrieveItemsFromZone("estoque", fetchList)
                stockedUp = true 

                // 3. Tenta novamente o MESMO item (agora abastecido)
                success = await bot.crafting.craftRecursively(itemCandidate, order.amount)
            }

            // Se obteve sucesso em qualquer etapa
            if (success) {
                orderSuccess = true
                craftedItemName = itemCandidate
                break // Para o loop de candidatos
            }
            
            // Se falhou, o loop continua para o próximo item (tier inferior)
        }

        if (orderSuccess) {
            bot.chat(`Sucesso! Craftei ${order.amount}x ${craftedItemName}. Guardando...`)
            await bot.movement.storeItemsInZone("base", (i) => i.name === craftedItemName)
        } else {
            bot.chat(`Falha total: Não consegui craftar nenhuma das opções pedidas.`)
            // Guarda o que pegou para limpar inventário
            await bot.movement.storeItemsInZone("estoque", (i) => true) 
        }

        queue.shift() // Remove pedido concluído ou falho

    } catch (err) {
        logger(`[Crafter] Erro Fatal: ${err.message}`)
        console.error(err)
        bot.chat(`Erro ao processar pedido.`)
        queue.shift()
    } finally {
        isWorking = false
        // Delay para evitar spam e garantir atualização de estado
        if (queue.length > 0) {
            setTimeout(() => processQueue(), 1000)
        } else {
            bot.chat("Fila finalizada.")
        }
    }
  }

  return { setEnabled, addOrder }
}