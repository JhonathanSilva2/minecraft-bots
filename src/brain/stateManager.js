export function createStateManager(logger) {
  const states = {}
  let active = null
  return {
    register(name, module) {
      states[name] = module
      logger?.(`[state] Registrado estado: ${name}`)
    },

    setState(name, bot, data = {}) {
      const next = states[name]
      if (!next) {
        logger?.(`[state] Estado não encontrado: ${name}`)
        return
      }

      if (active?.exit) active.exit(bot)
      active = next
      if (active?.enter) active.enter(bot, data)
    },

    update(bot) {
      if (active?.update) active.update(bot)
    },
  }
}
