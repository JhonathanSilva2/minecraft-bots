const AREA_REGEX = /^(\d+)x(\d+)$/i
const COORD_REGEX = /^([xyz])[:=]?(-?\d+)$/i

function parseAreaToken(token) {
  const match = AREA_REGEX.exec(token ?? "")
  if (!match) return null

  const width = Number.parseInt(match[1], 10)
  const depth = Number.parseInt(match[2], 10)

  if (Number.isNaN(width) || Number.isNaN(depth)) {
    return null
  }

  return { width, depth }
}

export default async function localCommand(bot, args, logger) {
  const [name, areaToken, ...rest] = args
  const area = parseAreaToken(areaToken)

  if (!name || !area) {
    bot.chat(
      "Uso: !local <nome> <LxA> [xN yN zN] (ex: !local armazem 10x10 x-10 y-78 z-40)"
    )
    return
  }

  const { width, depth } = area
  const pos = bot.entity.position
  const coords = {
    x: Math.floor(pos.x),
    y: Math.floor(pos.y),
    z: Math.floor(pos.z),
  }

  for (const token of rest) {
    const match = COORD_REGEX.exec(token)
    if (!match) continue
    const axis = match[1].toLowerCase()
    const value = Number.parseInt(match[2], 10)
    if (Number.isNaN(value)) continue
    coords[axis] = value
  }

  const locationData = {
    x: coords.x,
    y: coords.y,
    z: coords.z,
    width,
    depth,
  }

  try {
    await bot.locations.setLocation(name.toLowerCase(), locationData)
    const areaLabel = `${width}x${depth}`
    const coordsLabel = `${locationData.x},${locationData.y},${locationData.z}`
    bot.chat(
      `\uD83D\uDCE6 Armaz\u00e9m registrado! \u00c1rea: ${areaLabel} em ${coordsLabel}`
    )
    logger?.(
      `[local] ${name} registrado em ${coordsLabel} com area ${areaLabel}`
    )
  } catch (err) {
    bot.chat("N\u00e3o foi poss\u00edvel registrar o local agora.")
    logger?.(`[local] falha ao salvar ${name}: ${err?.message ?? err}`)
  }
}
