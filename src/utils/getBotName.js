import { professionRegistry } from "../professions/index.js"

function sanitizeName(name) {
  return name.trim().replace(/[^a-zA-Z0-9_-]/g, "")
}

export function getBotConfigs() {
  const args = process.argv.slice(2)
  const knownProfessions = new Set(Object.keys(professionRegistry))
  const configs = []

  for (const raw of args) {
    const sanitized = sanitizeName(raw)
    if (!sanitized) continue

    const normalized = sanitized.toLowerCase()

    if (knownProfessions.has(normalized)) {
      // Se for uma profissão conhecida, aplica na última instância criada
      if (configs.length === 0) {
        configs.push({ name: "Max", professions: [] })
      }

      const target = configs[configs.length - 1]
      if (!target.professions.includes(normalized)) {
        target.professions.push(normalized)
      }

      continue
    }

    // Caso contrário, é um novo nome de bot
    configs.push({ name: sanitized, professions: [] })
  }

  if (configs.length === 0) {
    configs.push({ name: "Max", professions: [] })
  }

  return configs
}

// Compatibilidade: mantém a API antiga se alguém ainda usar
export function getBotNames() {
  return getBotConfigs().map((cfg) => cfg.name)
}
