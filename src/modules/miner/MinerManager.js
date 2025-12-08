import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

// Importação estática garante que 'goals' esteja disponível sempre
const { goals } = pf

export default class MinerManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
    this.isMining = false
    
    // Vetores de direção para cálculos de túneis (Frente + Baixo)
    this.directions = {
        north: new Vec3(0, 0, -1),
        south: new Vec3(0, 0, 1),
        east: new Vec3(1, 0, 0),
        west: new Vec3(-1, 0, 0),
    }
  }

  // ======================================================
  // UTILITÁRIOS DE INVENTÁRIO
  // ======================================================

  hasPickaxe() {
    return this.bot.inventory.items().some(i => i.name.includes('pickaxe'))
  }

  countItem(itemName) {
    return this.bot.inventory.items()
        .filter(i => i.name === itemName)
        .reduce((acc, i) => acc + i.count, 0)
  }

  // ======================================================
  // AÇÃO BÁSICA DE MINERAÇÃO
  // ======================================================

  /**
   * Move o bot até o alcance do bloco, equipa a ferramenta e quebra.
   * Inclui verificação de segurança contra líquidos e visual (lookAt).
   */
  async mineBlockAt(pos) {
    const block = this.bot.blockAt(pos)
    
    // 1. Validação Básica: Se é ar ou nulo, já "sucesso"
    if (!block || block.type === 0) return true 

    // 2. PROTEÇÃO CONTRA ÁGUA/LAVA (O Alvo)
    if (block.name === 'water' || block.name === 'lava' || block.name.includes('flowing_')) {
        // Silencioso para não spammar log em verificações de rotina
        return false
    }

    // 3. Verificação de Hardness (Bedrock)
    if (block.hardness === null || block.hardness > 100) return false

    // 4. SCAN DE PERIGO (6 Vizinhos)
    const offsets = [
        { x: 0, y: 1, z: 0 },  // Cima
        { x: 0, y: -1, z: 0 }, // Baixo
        { x: 1, y: 0, z: 0 },  // Leste
        { x: -1, y: 0, z: 0 }, // Oeste
        { x: 0, y: 0, z: 1 },  // Sul
        { x: 0, y: 0, z: -1 }  // Norte
    ]

    for (const off of offsets) {
        const neighborPos = pos.offset(off.x, off.y, off.z)
        const neighbor = this.bot.blockAt(neighborPos)
        
        if (neighbor && (neighbor.name === 'water' || neighbor.name === 'lava' || neighbor.name.includes('flowing_'))) {
            // Retorna false para abortar a mineração deste bloco específico
            return false 
        }
    }

    // 5. Execução
    try {
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 4)
        await this.bot.pathfinder.goto(goal)
        
        // NOVO: Olhar para o bloco antes de interagir (Human-like behavior)
        await this.bot.lookAt(pos.offset(0.5, 0.5, 0.5))

        // Equipa ferramenta
        try {
             await this.bot.tool.equipForBlock(block, { requireHarvest: true })
        } catch (e) {
             this.logger?.(`[MinerManager] Sem ferramenta para ${block.name}`)
             return false
        }
        
        // Quebra
        await this.bot.dig(block)
        
        // Pequeno delay para processar física do servidor
        await new Promise(r => setTimeout(r, 250))
        return true

    } catch (err) {
        // Erros de pathfinding ou interrupção
        return false
    }
  }

  // ======================================================
  // ESTRATÉGIAS DE ESCAVAÇÃO
  // ======================================================

  /**
   * Cava um "degrau" de escada (túnel 1x2 descendo).
   */
  async digStaircaseStep(cardinalDirection) {
    const dir = this.directions[cardinalDirection]
    if (!dir) throw new Error("Direção inválida")

    const botPos = this.bot.entity.position.floored()
    
    // Calcula onde o bot vai pisar no próximo passo (Frente + Baixo)
    const nextStandPos = botPos.plus(dir).offset(0, -1, 0)

    // Blocos que precisam ser removidos
    const targetHead = nextStandPos.offset(0, 1, 0) // Espaço da cabeça
    const targetFeet = nextStandPos // Espaço dos pés
    
    // Bloco à frente da cabeça atual (para não bater a cabeça ao descer)
    const frontHead = botPos.plus(dir).offset(0, 1, 0)

    this.logger?.(`[MinerManager] Cavando degrau para ${cardinalDirection}...`)

    // Ordem de quebra: Frente -> Cima -> Baixo
    if (!await this.mineBlockAt(frontHead)) return false
    if (!await this.mineBlockAt(targetHead)) return false
    if (!await this.mineBlockAt(targetFeet)) return false

    // Se chegou aqui, é seguro andar
    const moveGoal = new goals.GoalBlock(nextStandPos.x, nextStandPos.y, nextStandPos.z)
    try {
        await this.bot.pathfinder.goto(moveGoal)
        return true
    } catch (e) {
        this.logger?.(`[MinerManager] Erro ao mover para degrau: ${e.message}`)
        return false
    }
  }

  /**
   * Algoritmo "Flood Fill" para minerar um veio inteiro de minérios conectados.
   * Retorna TRUE se minerou pelo menos um bloco com sucesso.
   */
  async mineVein(startingBlock) {
    if (!startingBlock || !startingBlock.position) return false // Proteção inicial

    const oreType = startingBlock.type
    const visited = new Set() 
    const toMine = [startingBlock] 
    let minedAtLeastOne = false

    while (toMine.length > 0) {
        const current = toMine.shift()
        
        // Proteção extra dentro do loop
        if (!current || !current.position) continue

        const key = current.position.toString()
        if (visited.has(key)) continue
        visited.add(key)

        // Minera o bloco atual
        const success = await this.mineBlockAt(current.position)
        
        if (!success) continue 

        minedAtLeastOne = true

        // Procura vizinhos
        const neighbors = this.bot.findBlocks({
            matching: oreType,
            maxDistance: 2, 
            count: 10,
            point: current.position
        })

        for (const vec of neighbors) {
            // Verifica se 'vec' existe antes de usar toString
            if (vec && !visited.has(vec.toString())) {
                const block = this.bot.blockAt(vec)
                // Só adiciona se o bloco for válido E tiver posição
                if (block && block.position) toMine.push(block)
            }
        }
    }
    return minedAtLeastOne
  }
}