import followCommand from "./followCommand.js"
import stopCommand from "./stopCommand.js"
import statusCommand from "./statusCommand.js"
import localCommand from "./localCommand.js"
import { CRAFT_TIERS } from "../modules/craft/craftTiers.js"

const KNOWN_COMMANDS = new Set([
  "seguir",
  "parar",
  "profissao",
  "profissão",
  "status",
  "local",
  "armazem",
  "craftar",
  "minerar",
])

export function createCommandHandler(stateManager, logger) {
  return (bot, username, message) => {
    const words = message.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return

    const first = words[0]
    const hasBang = first.startsWith("!")
    const rawPrefixName = hasBang ? first.slice(1) : first
    const normalizedPrefixName = rawPrefixName.toLowerCase()
    const isKnownCommand = KNOWN_COMMANDS.has(normalizedPrefixName)

    let scope = "self"
    let command = null
    let args = []

    if (hasBang && !isKnownCommand && normalizedPrefixName !== "all") {
      if (rawPrefixName !== bot.username) return
      command = words[1]
      args = words.slice(2)
    } else if (hasBang && normalizedPrefixName === "all") {
      scope = "all"
      command = words[1]
      args = words.slice(2)
    } else {
      command = rawPrefixName
      args = words.slice(1)
    }

    command = (command || "").toLowerCase()

    if (command === "seguir") {
      handleFollow()
      return
    }

    if (command === "parar") {
      handleStop()
      return
    }

    if (command === "profissao" || command === "profiss\u00e3o") {
      handleProfession()
      return
    }

    if (command === "status") {
      handleStatus()
      return
    }

    if (command === "local") {
      handleLocal()
      return
    }

    if (command === "armazem") {
      handleStorage()
      return
    }

    if (command === "ir") {
      handleGoto()
    }

    if (command === "craftar") {
      handleCraft()
      return
    }

    if (command === "minerar") {
      handleMine()
      return
    }

    function handleFollow() {
      if ((args[0] || "").toLowerCase() === "me") {
        logger?.(`[command] ${bot.username} -> seguir ${username}`)
        followCommand(bot, username, username, stateManager, logger)
        return
      }

      if (args.length === 0) {
        logger?.(`[command] seguir automatico -> ${username}`)
        followCommand(bot, username, username, stateManager, logger)
        return
      }

      const targetName = args[0]

      if (scope === "all") {
        logger?.(`[command] !all seguir ${targetName}`)
        followCommand(bot, username, targetName, stateManager, logger)
        return
      }

      followCommand(bot, username, targetName, stateManager, logger)
    }

    function handleStop() {
      if (scope === "all") {
        logger?.("[command] !all parar")
        stopCommand(bot, stateManager, logger)
        return
      }

      if (args.length === 0) {
        stopCommand(bot, stateManager, logger)
        return
      }

      if (args.includes(bot.username)) {
        stopCommand(bot, stateManager, logger)
      }
    }

    function handleCraft() {
      const itemInput = (args[0] || "").toLowerCase()
      const amount = args[1] ? parseInt(args[1]) : 1

      if (!itemInput) {
        bot.chat(`Uso: !${bot.username} craftar <item> [quantidade]`)
        return
      }

      // Busca a profissão
      const crafter = bot.professions.get("crafter")

      if (crafter) {
        // Verifica se é uma categoria (ex: "machado")
        // Se for, passa a lista. Se não, passa a string direta.
        const candidates = CRAFT_TIERS[itemInput] || itemInput

        crafter.addOrder(candidates, amount)
      } else {
        bot.chat("A profissão de Crafter não está ativa no momento.")
      }
    }

    function handleMine() {
      const inputOrAction = (args[0] || "").toLowerCase()
      const directionInput = (args[1] || "").toLowerCase()

      const miner = bot.professions.get("miner")
      if (!miner) {
        bot.chat("A profissão de Minerador não está ativa.")
        return
      }

      // 1. Comando de Parar
      if (["parar", "stop", "off"].includes(inputOrAction)) {
        miner.setEnabled(false)
        return
      }

      if (!inputOrAction) {
        bot.chat(
          `Uso: !${bot.username} minerar <minerio|parar> [norte|sul|leste|oeste]`
        )
        return
      }

      // 2. Configuração de Direção e Base
      const directionMap = {
        norte: "north",
        north: "north",
        sul: "south",
        south: "south",
        leste: "east",
        east: "east",
        oeste: "west",
        west: "west",
      }

      // Usa a direção informada ou 'norte' como padrão
      const dir = directionMap[directionInput] || "north"

      // Define a base como a posição atual do bot no momento do comando
      const currentPos = bot.entity.position.clone()

      // Define o ponto inicial da mineração 20 blocos à frente
      const offset = {
        north: [0, -20],
        south: [0, 20],
        east: [20, 0],
        west: [-20, 0],
      }[dir]

      const mineStart = currentPos.offset(offset[0], 0, offset[1])

      // 3. Define Alvos (Minérios)
      // Traduz "ferro" -> ['iron_ore', ...] ou usa o input direto
      const targetOres = ORE_ALIASES[inputOrAction] || [inputOrAction]

      // 4. Aplica e Inicia
      bot.chat(
        `Configurando mina: Base aqui, Túnel iniciando a 20 blocos para ${dir}. Alvo: ${inputOrAction}`
      )

      miner.setConfig(currentPos, mineStart, dir)
      miner.setTarget(targetOres) // Isso já chama setEnabled(true) internamente no seu miner.js
      miner.setEnabled(true)
    }

    function handleProfession() {
      const professionName = (args[0] || "").toLowerCase()
      const action = (args[1] || "").toLowerCase()

      const permitted_professions = [
        "lenhador",
        "estoquista",
        "crafter",
        "minerador",
        "fazendeiro",
      ]

      if (!permitted_professions.includes(professionName)) return
      if (!bot.professions) return

      if (action === "on") {
        logger?.(`[command] ativando profissao: ${professionName}`)
        bot.professions.enable(professionName)
      } else if (action === "off") {
        logger?.(`[command] desativando profissao: ${professionName}`)
        bot.professions.disable(professionName)
      }
    }

    function handleStatus() {
      const targets = args.map((name) => name.toLowerCase())
      const targetAll = targets.length === 0 || targets.includes("all")

      if (!targetAll && !targets.includes(bot.username.toLowerCase())) return

      statusCommand(bot, logger)
    }

    function handleLocal() {
      localCommand(bot, args, logger)
    }

    function handleGoto() {
      const [locationName] = args
      if (scope === "all" || rawPrefixName === bot.username || !hasBang) {
        bot.movement.gotoLocation(locationName)
      }
    }

    function handleStorage() {
      const action = (args[0] || "").toLowerCase()

      if (action === "guardar") {
        logger?.(`[command] ${bot.username} -> armazem guardar`)
        storeInventoryForBot(bot, logger)
        return
      }

      if (action === "pegar") {
        const itemName = (args[1] || "").toLowerCase()
        const amount = Number(args[2] ?? "1")

        if (!itemName) {
          bot.chat("Uso: !<bot> armazem pegar <item> <quantidade>")
          return
        }

        withdrawItemFromChest(bot, itemName, amount, logger)
        return
      }

      bot.chat(
        "Uso: !<bot> armazem guardar | !<bot> armazem pegar <item> <quantidade>"
      )
    }
  }
}
