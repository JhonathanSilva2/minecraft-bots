import pf from "mineflayer-pathfinder"
import { Vec3 } from "vec3"

const { goals } = pf

export default class MinerManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger
    this.isMining = false
    
    // Vetores de direção para cavar escada (Frente + Baixo)
    this.directions = {
        north: new Vec3(0, 0, -1),
        south: new Vec3(0, 0, 1),
        east: new Vec3(1, 0, 0),
        west: new Vec3(-1, 0, 0),
    }
  }

  /**
   * Verifica se temos uma picareta válida
   */
  hasPickaxe() {
    return this.bot.inventory.items().some(i => i.name.includes('pickaxe'))
  }

  /**
   * Conta quantos itens desse tipo temos
   */
  countItem(itemName) {
    return this.bot.inventory.items()
        .filter(i => i.name === itemName)
        .reduce((acc, i) => acc + i.count, 0)
  }

  /**
   * Executa a quebra de um bloco específico
   */
  async mineBlockAt(pos) {
    const block = this.bot.blockAt(pos)
    if (!block || block.type === 0) return true // Já é ar

    // Se for bedrock ou indestrutível, retorna false
    if (block.hardness === null || block.hardness > 100) return false

    // Segurança: Líquidos
    const liquid = this.bot.blockAt(pos.offset(0, 1, 0)) // Bloco acima
    if (liquid && (liquid.name === 'lava' || liquid.name === 'water')) {
        this.logger?.("[MinerManager] Perigo: Líquido detectado acima!")
        return false
    }

    try {
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 4)
        await this.bot.pathfinder.goto(goal)
        
        await this.bot.tool.equipForBlock(block, { requireHarvest: true })
        await this.bot.dig(block)
        
        // Delay pequeno para coletar
        await new Promise(r => setTimeout(r, 200))
        return true
    } catch (err) {
        this.logger?.(`[MinerManager] Erro ao cavar: ${err.message}`)
        return false
    }
  }

  /**
   * Calcula e quebra os blocos para formar o próximo degrau da escada
   * Padrão: 1x2 (Altura) descendo 1 bloco a cada passo
   * @param {string} cardinalDirection - 'north', 'south', 'east', 'west'
   */
  async digStaircaseStep(cardinalDirection) {
    const dir = this.directions[cardinalDirection]
    if (!dir) throw new Error("Direção inválida")

    const botPos = this.bot.entity.position.floored()
    
    // Onde vamos pisar a seguir (Frente + Baixo)
    const nextStandPos = botPos.plus(dir).offset(0, -1, 0)

    // Blocos para quebrar para liberar o espaço (Cabeça e Pé na posição alvo)
    const targetHead = nextStandPos.offset(0, 1, 0) // Cabeça
    const targetFeet = nextStandPos // Pé
    
    // Às vezes precisamos limpar o bloco na frente da cabeça atual antes de descer
    const frontHead = botPos.plus(dir).offset(0, 1, 0)

    this.logger?.(`[MinerManager] Cavando degrau em direção ${cardinalDirection}...`)

    // Sequência de quebra segura
    await this.mineBlockAt(frontHead) // Limpa frente cima
    await this.mineBlockAt(targetHead) // Alvo Cima
    await this.mineBlockAt(targetFeet) // Alvo Baixo

    // Move para o degrau criado
    const moveGoal = new goals.GoalBlock(nextStandPos.x, nextStandPos.y, nextStandPos.z)
    await this.bot.pathfinder.goto(moveGoal)
    
    return true
  }
}