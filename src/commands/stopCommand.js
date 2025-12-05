export default function stopCommand(bot, stateManager, logger) {
  logger?.(`[stop] Parando movimento do bot ${bot.username}`)
  bot.chat("Ok, vou parar.")

  if (bot.pathfinder) {
    bot.pathfinder.setGoal(null)
  }

  stateManager.setState("idle", bot)
}
