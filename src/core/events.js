export function attachEventHandlers(bot, logger) {
  // Atualiza o cérebro
  bot.on("physicsTick", () => {
    bot.brain.stateManager.update(bot)
  })

  // Escuta o chat
  bot.on("chat", (username, message) => {
    if (username === bot.username) return
    bot.commandHandler(bot, username, message)
  })

  // Logs básicos
  bot.on("error", (err) => logger("[error]", err))
  bot.on("end", () => logger("[end] Bot desconectado."))
}
