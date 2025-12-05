import { createStateManager } from "./stateManager.js"
import idle from "./states/idle.js"
import follow from "./states/follow.js"

export function createBrain(logger) {
  const stateManager = createStateManager(logger)

  function initialize(bot) {
    stateManager.register("idle", idle)
    stateManager.register("follow", follow)
    stateManager.setState("idle", bot)
    logger?.("[brain] Inicializado")
  }

  function update(bot) {
    stateManager.update(bot)
  }

  return { initialize, update, stateManager }
}
