import followCommand from "./followCommand.js"
import stopCommand from "./stopCommand.js"

const KNOWN_COMMANDS = new Set(["seguir", "parar", "profissao", "profiss\u00e3o"])

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

    function handleProfession() {
      const professionName = (args[0] || "").toLowerCase()
      const action = (args[1] || "").toLowerCase()

      if (professionName !== "lenhador") return
      if (!bot.professions) return

      if (action === "on") {
        logger?.("[command] ativando profissao lenhador")
        bot.professions.enable("lenhador")
      } else if (action === "off") {
        logger?.("[command] desativando profissao lenhador")
        bot.professions.disable("lenhador")
      }
    }
  }
}
