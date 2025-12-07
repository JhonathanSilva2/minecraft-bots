import pf from "mineflayer-pathfinder"
const { Movements, goals } = pf
const { GoalNear } = goals
import { Vec3 } from "vec3"

// IMPORTAÇÃO DOS GRUPOS
import { ITEM_GROUPS } from "./craft/craftTiers.js"

// Lista de itens prioritários (materiais de construção e drops comuns)
// Estes itens serão depositados primeiro quando buscarmos um baú vazio.
const PRIORITY_ITEMS = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "jungle_log",
  "acacia_log",
  "dark_oak_log",
  "cherry_log",
  "mangrove_log",
  "cobblestone",
  "stone",
  "andesite",
  "diorite",
  "granite",
  "tuff",
  "deepslate",
  "dirt",
  "sand",
  "gravel",
  "grass_block",
  "rotten_flesh",
  "bone",
  "arrow",
  "spider_eye",
  "gunpowder",
]

// Função auxiliar para descobrir a categoria (AGORA USA O IMPORT)
function getItemCategory(itemName) {
  for (const [category, patterns] of Object.entries(ITEM_GROUPS)) {
    // Verifica se:
    // 1. O nome é EXATAMENTE igual ao padrão (ex: "stone")
    // 2. O padrão é um sufixo/prefixo (tem "_" e o nome inclui). Ex: "_log" bate com "oak_log"
    if (patterns.some(p => {
        if (p.includes('_')) return itemName.includes(p)
        return itemName.includes(p) // Simplificação: se contém a palavra (ex: "sand" em "sandstone" - cuidado, mas útil)
    })) {
      return category
    }
  }
  return 'outros'
}

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
      const baseLoc = await bot.locations.get("base")
      const stockLoc = await bot.locations.get("estoque")

      if (!baseLoc || !stockLoc) {
        logger?.(
          "[estoquista] ERRO: Locais 'base' ou 'estoque' não configurados no locations.json"
        )
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
        if (bot.currentWindow) bot.currentWindow.close()
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
      await moveTo({
        x: chestBlock.position.x,
        y: chestBlock.position.y,
        z: chestBlock.position.z,
      })

      const window = await bot.openContainer(chestBlock)
      try {
        const items = window.containerItems()
        if (items.length > 0) {
          logger?.(
            `[estoquista] Coletando itens de baú em ${chestBlock.position}`
          )

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
    const emptyChests = []

    // FASE 1: Baús já ocupados (Respeitar categoria)
    for (const chestBlock of chests) {
      if (!enabled || bot.inventory.items().length === 0) break

      await moveTo(chestBlock.position)
      const window = await bot.openContainer(chestBlock)

      try {
        const chestItems = window.containerItems()
        
        if (chestItems.length === 0) {
          emptyChests.push(chestBlock)
          continue
        }

        // Identifica categoria do baú
        const sampleItem = chestItems[0]
        const chestCategory = getItemCategory(sampleItem.name)
        
        // logger?.(`[estoque] Baú ${chestCategory.toUpperCase()}`)

        const botItems = bot.inventory.items()
        
        for (const item of botItems) {
          const itemCategory = getItemCategory(item.name)
          const isSameItem = chestItems.some(i => i.type === item.type)
          
          // Se for da mesma categoria ou for o mesmo item, guarda
          if (isSameItem || (itemCategory === chestCategory && itemCategory !== 'outros')) {
            try {
              await window.deposit(item.type, item.metadata, item.count)
            } catch (e) {}
          }
        }
      } finally {
        window.close()
      }
    }

    // FASE 2: Baús Vazios (Prioridades Primeiro)
    if (bot.inventory.items().length > 0 && emptyChests.length > 0) {
        logger?.("[estoque] Usando baús vazios...")

        // Tenta agrupar itens do inventário por categoria antes de colocar
        // (Isso é uma melhoria simples: se tenho 3 tipos de madeira na mão e acho um baú vazio, coloco todos lá)
        
        for (const chestBlock of emptyChests) {
            if (bot.inventory.items().length === 0) break

            await moveTo(chestBlock.position)
            const window = await bot.openContainer(chestBlock)
            
            try {
                // Definimos a categoria do baú novo baseada no primeiro item que vamos colocar
                let assignedCategory = null
                
                // Pega itens do bot ordenados (prioridade primeiro)
                const itemsToDeposit = bot.inventory.items().sort((a, b) => {
                    const aPrio = PRIORITY_ITEMS.includes(a.name) ? 1 : 0
                    const bPrio = PRIORITY_ITEMS.includes(b.name) ? 1 : 0
                    return bPrio - aPrio
                })

                for (const item of itemsToDeposit) {
                    const itemCat = getItemCategory(item.name)
                    
                    // Se o baú ainda não tem categoria, ele ganha a desse item
                    if (assignedCategory === null) {
                        assignedCategory = itemCat
                    }

                    // Se a categoria do item bater com a do baú (ou for o mesmo item se for 'outros')
                    if (assignedCategory === 'outros' || itemCat === assignedCategory) {
                         await window.deposit(item.type, item.metadata, item.count)
                    }
                }
            } finally {
                window.close()
            }
        }
    }

    // FASE 3: Sobras -> Devolve
    if (bot.inventory.items().length > 0) {
      logger?.("[estoque] Sobras devolvidas para a base.")
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
        bot.registry.blocksByName["chest"].id,
        bot.registry.blocksByName["barrel"].id,
        bot.registry.blocksByName["trapped_chest"]?.id,
      ].filter(Boolean),
      maxDistance: 64, // Raio grande para garantir
      count: 200,
    })

    // Filtragem precisa dentro do retângulo
    return (
      allChests
        .map((pos) => bot.blockAt(pos))
        .filter((block) => {
          const p = block.position
          return (
            p.x >= minX &&
            p.x <= maxX &&
            p.z >= minZ &&
            p.z <= maxZ &&
            p.y >= minY &&
            p.y <= maxY
          )
        })
        // Ordena pelo mais próximo do bot para evitar zigue-zague
        .sort(
          (a, b) =>
            bot.entity.position.distanceTo(a.position) -
            bot.entity.position.distanceTo(b.position)
        )
    )
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
