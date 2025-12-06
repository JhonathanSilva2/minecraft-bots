import pf from "mineflayer-pathfinder"
const { Movements, goals } = pf
const { GoalNear } = goals
import { Vec3 } from "vec3"

// Importação do seu gerenciador de locais (ajuste o caminho se necessário)
import { getLocation } from "../storage/locationManager.js"

// Lista de itens prioritários (materiais de construção e drops comuns)
// Estes itens serão depositados primeiro quando buscarmos um baú vazio.
const PRIORITY_ITEMS = [
  "oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "cherry_log", "mangrove_log",
  "cobblestone", "stone", "andesite", "diorite", "granite", "tuff", "deepslate",
  "dirt", "sand", "gravel", "grass_block",
  "rotten_flesh", "bone", "arrow", "spider_eye", "gunpowder"
]

export function createEstoquista(bot, logger) {
  let enabled = false
  let running = false

  // Loop principal de física
  bot.on("physicsTick", () => {
    if (!enabled || running) return
    running = true
    runCycle().finally(() => {
      running = false
    })
  })

  // --- CONTROLE DE ESTADO ---
  function setEnabled(value) {
    enabled = value

    if (!value) {
      stopCurrentActions()
    }

    bot.chat(value ? "Estoquista ativado!" : "Estoquista desativado!")
  }

  function isEnabled() {
    return enabled
  }

  function stopCurrentActions() {
    if (bot.pathfinder?.stop) {
      bot.pathfinder.stop()
    } else if (bot.pathfinder) {
      bot.pathfinder.setGoal(null)
    }
    
    // Fecha qualquer janela aberta para não travar o bot
    if (bot.currentWindow) {
      bot.currentWindow.close()
    }
  }

  // --- LÓGICA PRINCIPAL ---
  async function runCycle() {
    try {
      if (!enabled) return

      // 1. Carregar coordenadas do gerenciador
      const baseLoc = await getLocation("base")
      const stockLoc = await getLocation("estoque")

      if (!baseLoc || !stockLoc) {
        logger?.("[estoquista] ERRO: Locais 'base' ou 'estoque' não configurados no locations.json")
        // Desativa para não spammar erro
        setEnabled(false)
        return
      }

      // 2. Verificar estado do inventário
      // Se tiver pouco espaço (menos de 2 slots vazios), prioriza guardar itens.
      // Se estiver vazio, prioriza buscar itens.
      const isInventoryFull = bot.inventory.emptySlotCount() < 2
      const isInventoryEmpty = bot.inventory.items().length === 0

      if (!isInventoryFull) {
        // Tenta coletar na base
        logger?.("[estoquista] Verificando baús na base...")
        const collected = await routineCollectFromBase(baseLoc)
        
        // Se não coletou nada e o inventário está vazio, descansa um pouco
        if (!collected && isInventoryEmpty) {
          logger?.("[estoquista] Nada para coletar. Aguardando...")
          await bot.waitForTicks(100) // Espera 5 segundos antes de tentar de novo
          return
        }
      }

      // 3. Se temos itens, vamos ao estoque distribuir
      if (bot.inventory.items().length > 0) {
        logger?.("[estoquista] Indo para o estoque organizar...")
        await routineDistributeToStock(stockLoc, baseLoc)
      }

    } catch (err) {
      if (enabled) {
        logger?.(`[estoquista] Erro fatal no ciclo: ${err?.message ?? err}`)
        // Recuperação: fecha janelas e tenta andar um pouco para destravar
        if(bot.currentWindow) bot.currentWindow.close()
      }
    }
  }

  // --- ROTINA 1: COLETA (BASE) ---
  async function routineCollectFromBase(locationData) {
    await moveTo(locationData)
    
    // Encontra todos os baús dentro da zona definida
    const chests = findChestsInZone(locationData)
    let collectedAny = false

    for (const chestBlock of chests) {
      if (!enabled || bot.inventory.emptySlotCount() === 0) break

      // Vai até o baú específico
      await moveTo({ x: chestBlock.position.x, y: chestBlock.position.y, z: chestBlock.position.z })
      
      const window = await bot.openContainer(chestBlock)
      try {
        const items = window.containerItems()
        if (items.length > 0) {
          logger?.(`[estoquista] Coletando itens de baú em ${chestBlock.position}`)
          
          // Saca tudo
          for (const item of items) {
            await window.withdraw(item.type, item.metadata, item.count)
            collectedAny = true
            if (bot.inventory.emptySlotCount() === 0) break
          }
        }
      } catch (err) {
        logger?.(`[estoquista] Erro ao acessar baú: ${err.message}`)
      } finally {
        window.close()
        await bot.waitForTicks(10) // Pequeno delay
      }
    }
    return collectedAny
  }

  // --- ROTINA 2: DISTRIBUIÇÃO (ESTOQUE) ---
  async function routineDistributeToStock(stockLoc, returnLoc) {
    await moveTo(stockLoc)
    const chests = findChestsInZone(stockLoc)

    // FASE 1: Agrupamento (Smart Stacking)
    // Procura baús que JÁ tenham o item para completar os packs
    for (const chestBlock of chests) {
      if (!enabled || bot.inventory.items().length === 0) return

      // Só abre se tivermos itens compatíveis? (Difícil saber sem abrir, então abrimos todos por enquanto)
      // Otimização futura: Cache de memória do conteúdo dos baús.
      
      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)
      
      try {
        const chestItems = window.containerItems()
        const botItems = bot.inventory.items()

        for (const item of botItems) {
          // Verifica se o baú tem o mesmo item E espaço no stack
          const match = chestItems.find(i => i.type === item.type && i.count < i.stackSize)
          if (match) {
            try {
              await window.deposit(item.type, item.metadata, item.count)
              logger?.(`[estoque] Agrupando ${item.name}...`)
            } catch (e) { /* Ignora erro se encher */ }
          }
        }
      } finally {
        window.close()
      }
    }

    // FASE 2: Preencher Baús Vazios (Prioridades Primeiro)
    const remainingItems = bot.inventory.items()
    if (remainingItems.length > 0) {
      logger?.("[estoque] Itens restantes. Procurando espaço vazio...")
      
      // Ordena o inventário para depositar PRIORIDADES primeiro
      remainingItems.sort((a, b) => {
        const aPrio = PRIORITY_ITEMS.includes(a.name) ? 1 : 0
        const bPrio = PRIORITY_ITEMS.includes(b.name) ? 1 : 0
        return bPrio - aPrio // Maior prioridade primeiro
      })

      for (const chestBlock of chests) {
        if (!enabled || bot.inventory.items().length === 0) break

        await moveTo(chestBlock.position)
        const window = await bot.openContainer(chestBlock)
        
        try {
          // Se tiver slot vazio no baú
          if (window.emptySlotCount() > 0) {
            // Recalcula itens atuais do bot (pois o loop anterior pode ter depositado algo)
            const currentItems = bot.inventory.items()
            
            // Re-ordena (opcional, mas garante consistência)
             currentItems.sort((a, b) => {
                const aPrio = PRIORITY_ITEMS.includes(a.name) ? 1 : 0
                const bPrio = PRIORITY_ITEMS.includes(b.name) ? 1 : 0
                return bPrio - aPrio
              })

            for (const item of currentItems) {
              await window.deposit(item.type, item.metadata, item.count)
              if (window.emptySlotCount() === 0) break
            }
          }
        } finally {
          window.close()
        }
      }
    }

    // FASE 3: Fallback (Devolver para Base se estoque estiver lotado)
    if (bot.inventory.items().length > 0) {
      logger?.("[estoque] ALERTA: Estoque cheio! Devolvendo itens para a base...")
      await moveTo(returnLoc)
      await dumpInventory(returnLoc)
    }
  }

  // --- DEVOLUÇÃO DE EMERGÊNCIA ---
  async function dumpInventory(locationData) {
    const chests = findChestsInZone(locationData)
    for (const chestBlock of chests) {
      if (bot.inventory.items().length === 0) break
      
      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)
      try {
        const items = bot.inventory.items()
        for (const item of items) {
          await window.deposit(item.type, item.metadata, item.count)
        }
      } finally {
        window.close()
      }
    }
  }

  // --- UTILITÁRIOS ---
  
  // Converte a zona (x, y, z, width, depth) em uma lista de blocos de baú
  function findChestsInZone(loc) {
    // Definindo a Bounding Box (Caixa Delimitadora)
    const minX = loc.x
    const maxX = loc.x + (loc.width || 1)
    const minZ = loc.z // Assumindo Z como profundidade baseado no seu JSON
    const maxZ = loc.z + (loc.depth || 1)
    const minY = loc.y - 1
    const maxY = loc.y + 2 // Tolerância vertical de 2 blocos

    // Busca bruta inicial
    const allChests = bot.findBlocks({
      matching: [
        bot.registry.blocksByName['chest'].id, 
        bot.registry.blocksByName['barrel'].id,
        bot.registry.blocksByName['trapped_chest']?.id
      ].filter(Boolean),
      maxDistance: 64, // Raio grande para garantir
      count: 200
    })

    // Filtragem precisa dentro do retângulo
    return allChests
      .map(pos => bot.blockAt(pos))
      .filter(block => {
        const p = block.position
        return p.x >= minX && p.x <= maxX &&
               p.z >= minZ && p.z <= maxZ &&
               p.y >= minY && p.y <= maxY
      })
      // Ordena pelo mais próximo do bot para evitar zigue-zague
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  }

  async function moveTo(loc) {
    const defaultMove = new Movements(bot)
    // Evita quebrar blocos ou colocar blocos ao andar no estoque
    defaultMove.canDig = false 
    defaultMove.canPlaceOn = false 
    
    bot.pathfinder.setMovements(defaultMove)

    // GoalNear permite chegar PERTO da coordenada (raio 1)
    const goal = new GoalNear(loc.x, loc.y, loc.z, 1)
    await bot.pathfinder.goto(goal)
  }

  return { setEnabled, isEnabled }
}