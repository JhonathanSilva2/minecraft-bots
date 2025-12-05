import pf from "mineflayer-pathfinder"
const { Movements, goals } = pf
const { GoalFollow } = goals

export default function followCommand(
  bot,
  username,
  targetName,
  stateManager,
  logger
) {
  // Se não passar nome, segue quem mandou o comando
  const nameToFollow = targetName || username

  // Se tentar seguir o próprio bot, ignorar
  if (nameToFollow === bot.username) {
    bot.chat("Eu não posso seguir a mim mesmo 😅")
    logger?.("[follow] tentativa de seguir a si mesmo ignorada")
    return
  }

  const target = bot.players[nameToFollow]?.entity

  if (!target) {
    bot.chat(`Não encontrei ${nameToFollow} no mundo.`)
    logger?.(`[follow] ${nameToFollow} não está visível`)
    return
  }

  logger?.(`[follow] seguindo ${nameToFollow}`)
  bot.chat(`Seguindo ${nameToFollow}!`)

  const movements = new Movements(bot)
  bot.pathfinder.setMovements(movements)

  bot.pathfinder.setGoal(new GoalFollow(target, 1), true)

  // Mantém o estado atualizado
  stateManager.setState("follow", bot, { username: nameToFollow })
}
