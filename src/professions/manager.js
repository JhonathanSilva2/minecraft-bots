import { professionRegistry } from "./index.js"

export function createProfessionManager(bot, logger) {
  const active = {}

  function enable(name) {
    const factory = professionRegistry[name]
    if (!factory) {
      logger(`[profissão] '${name}' não existe`)
      return false
    }

    if (!active[name]) {
      active[name] = factory(bot, logger)
    }

    active[name].setEnabled(true)
    logger(`[profissão] '${name}' ativada`)
    return true
  }

  function disable(name) {
    if (!active[name]) return false
    active[name].setEnabled(false)
    logger(`[profissão] '${name}' desativada`)
    return true
  }

  function list() {
    return Object.keys(active).filter((name) => active[name].isEnabled())
  }

  return { enable, disable, list }
}
