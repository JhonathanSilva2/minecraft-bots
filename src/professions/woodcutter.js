import pf from "mineflayer-pathfinder"
const { Movements, goals } = pf
const { GoalNear } = goals

const TREE_TYPES = [
  "oak_log",
  "birch_log",
  "spruce_log",
  "jungle_log",
  "acacia_log",
  "dark_oak_log",
  "cherry_log",
  "mangrove_log",
]

export function createWoodcutter(bot, logger) {
  let enabled = false
  let running = false

  bot.on("physicsTick", () => {
    if (!enabled || running) return
    running = true
    runCycle().finally(() => {
      running = false
    })
  })

  function setEnabled(value) {
    enabled = value

    if (!value) {
      stopCurrentActions()
    }

    bot.chat(value ? "Lenhador ativado!" : "Lenhador desativado!")
  }

  function isEnabled() {
    return enabled
  }

  function stopCurrentActions() {
    if (bot.pathfinder?.stop) {
      bot.pathfinder.stop()
    } else if (bot.pathfinder) {
      bot.pathfinder.setGoal(null)
    }

    if (typeof bot.stopDigging === "function") {
      bot.stopDigging()
    }
  }

  async function runCycle() {
    try {
      const tree = findNearestTree()
      if (!tree || !enabled) return

      const basePos = findTrunkBase(tree.position)
      await moveTo(basePos)
      if (!enabled) return

      await cutTrunk(basePos)
    } catch (err) {
      if (enabled) {
        logger?.(`[lenhador] erro: ${err?.message ?? err}`)
      }
    }
  }

  function findNearestTree() {
    const ids = TREE_TYPES.map((name) => bot.registry.blocksByName[name]?.id).filter(
      Boolean
    )

    if (ids.length === 0) return null

    const found = bot.findBlocks({
      matching: ids,
      maxDistance: 40,
      count: 50,
    })

    if (!found.length) return null

    const blocks = found
      .map((pos) => bot.blockAt(pos))
      .filter(Boolean)
      .sort(
        (a, b) =>
          bot.entity.position.distanceTo(a.position) -
          bot.entity.position.distanceTo(b.position)
      )

    return blocks[0]
  }

  function findTrunkBase(pos) {
    let current = bot.blockAt(pos)
    let base = current

    while (current) {
      const below = bot.blockAt(current.position.offset(0, -1, 0))
      if (below && TREE_TYPES.includes(below.name)) {
        base = below
        current = below
        continue
      }
      break
    }

    return base?.position ?? pos
  }

  async function moveTo(pos) {
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)

    const goal = new GoalNear(pos.x, pos.y, pos.z, 1)
    await bot.pathfinder.goto(goal)
  }

  async function cutTrunk(startPos) {
    let currentPos = startPos

    while (enabled) {
      const block = bot.blockAt(currentPos)
      if (!block || !TREE_TYPES.includes(block.name)) break

      await bot.dig(block)
      currentPos = currentPos.offset(0, 1, 0)
    }
  }

  return { setEnabled, isEnabled }
}
