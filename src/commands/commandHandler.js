import followCommand from "./followCommand.js"
import stopCommand from "./stopCommand.js"
import statusCommand from "./statusCommand.js"
import localCommand from "./localCommand.js"

const KNOWN_COMMANDS = new Set([
  "seguir",
  "parar",
  "profissao",
  "profissão",
  "status",
  "local",
  "armazem",
  "craftar"
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
      const item = args[0]
      const amount = args[1] ? parseInt(args[1]) : 1

      if (!item) {
        bot.chat(`Uso: !${bot.username} craftar <item> [quantidade]`)
        return
      }

      // AQUI MUDOU: Buscamos a profissão ativa pelo gerenciador
      const crafter = bot.professions.get("crafter")

      // Verificamos se ela existe E se está ativada
      if (crafter && crafter.isEnabled()) {
        // Chamamos o método público da factory
        crafter.processOrder(item, amount)
      } else {
        bot.chat("A profissão de Crafter não está ativa no momento.")
      }
    }

    function handleProfession() {
      const professionName = (args[0] || "").toLowerCase()
      const action = (args[1] || "").toLowerCase()

      const permitted_professions = ["lenhador", "estoquista"]

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
