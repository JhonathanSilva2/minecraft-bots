import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

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
   * Inclui verificação de segurança contra líquidos.
   */
  async mineBlockAt(pos) {
    const block = this.bot.blockAt(pos)
    if (!block || block.type === 0) return true // Já é ar

    // Verifica se é inquebrável (Bedrock) ou muito duro
    if (block.hardness === null || block.hardness > 100) return false

    // Segurança: Verifica se há líquidos (lava/água) logo acima do bloco alvo
    const liquid = this.bot.blockAt(pos.offset(0, 1, 0)) 
    if (liquid && (liquid.name === 'lava' || liquid.name === 'water')) {
        this.logger?.("[MinerManager] Perigo: Líquido detectado acima! Abortando.")
        return false
    }

    try {
        // 1. Aproxima-se do bloco (Raio 4)
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 4)
        await this.bot.pathfinder.goto(goal)
        
        // 2. Equipa ferramenta adequada
        await this.bot.tool.equipForBlock(block, { requireHarvest: true })
        
        // 3. Quebra
        await this.bot.dig(block)
        
        // Pequeno delay para permitir que o servidor processe o drop e o bot colete
        await new Promise(r => setTimeout(r, 250))
        return true
    } catch (err) {
        this.logger?.(`[MinerManager] Erro ao cavar: ${err.message}`)
        return false
    }
  }

  // ======================================================
  // ESTRATÉGIAS DE ESCAVAÇÃO
  // ======================================================

  /**
   * Cava um "degrau" de escada (túnel 1x2 descendo).
   * Calcula as posições relativas baseadas na direção cardeal.
   */
  async digStaircaseStep(cardinalDirection) {
    const dir = this.directions[cardinalDirection]
    if (!dir) throw new Error("Direção inválida")

    const botPos = this.bot.entity.position.floored()
    
    // Calcula onde o bot vai pisar no próximo passo (Frente + Baixo)
    const nextStandPos = botPos.plus(dir).offset(0, -1, 0)

    // Blocos que precisam ser removidos para o bot caber
    const targetHead = nextStandPos.offset(0, 1, 0) // Espaço da cabeça
    const targetFeet = nextStandPos // Espaço dos pés
    
    // Bloco à frente da cabeça atual (para não bater a cabeça ao descer)
    const frontHead = botPos.plus(dir).offset(0, 1, 0)

    this.logger?.(`[MinerManager] Cavando degrau para ${cardinalDirection}...`)

    // Ordem de quebra: Cima -> Frente -> Baixo (Geralmente mais seguro)
    await this.mineBlockAt(frontHead) 
    await this.mineBlockAt(targetHead) 
    await this.mineBlockAt(targetFeet) 

    // Move o bot para o degrau recém-criado para continuar o ciclo
    const moveGoal = new goals.GoalBlock(nextStandPos.x, nextStandPos.y, nextStandPos.z)
    await this.bot.pathfinder.goto(moveGoal)
    
    return true
  }

  /**
   * Algoritmo "Flood Fill" para minerar um veio inteiro de minérios conectados.
   * Útil para carvão, ferro, cobre, etc.
   */
  async mineVein(startingBlock) {
    const oreType = startingBlock.type
    
    const visited = new Set() // Evita processar o mesmo bloco duas vezes
    const toMine = [startingBlock] // Fila de blocos para minerar

    while (toMine.length > 0) {
        const current = toMine.shift()
        const key = current.position.toString()
        
        if (visited.has(key)) continue
        visited.add(key)

        // Minera o bloco atual
        const success = await this.mineBlockAt(current.position)
        if (!success) continue // Se falhou (ex: lava), não procura vizinhos a partir dele

        // Procura vizinhos do mesmo tipo (Raio curto para garantir adjacência)
        const neighbors = this.bot.findBlocks({
            matching: oreType,
            maxDistance: 2, 
            count: 10,
            point: current.position
        })

        for (const vec of neighbors) {
            // Verifica se já visitamos este vizinho
            if (!visited.has(vec.toString())) {
                const block = this.bot.blockAt(vec)
                if (block) toMine.push(block)
            }
        }
    }
  }
}