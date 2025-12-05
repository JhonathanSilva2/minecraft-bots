import pkg from "mineflayer-pathfinder"
const { Movements, goals } = pkg

export default {
  enter(bot, data) {
    const player = bot.players[data.username]?.entity
    if (!player) {
      bot.chat("Não consigo ver você!")
      return
    }

    bot.chat("Indo até você!")

    const movements = new Movements(bot, bot.registry)
    bot.pathfinder.setMovements(movements)

    bot.pathfinder.setGoal(new goals.GoalFollow(player, 1), true)
  },

  update(bot) {},

  exit(bot) {
    bot.pathfinder.setGoal(null)
  },
}
