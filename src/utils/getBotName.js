export function getBotNames() {
  // Pega todos os argumentos após o "--"
  const rawNames = process.argv.slice(2)

  // Se nenhum nome foi passado → usa ["Max"]
  if (rawNames.length === 0) {
    return ["Max"]
  }

  // Sanitiza TODOS os nomes
  const sanitized = rawNames
    .map((name) => name.trim().replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((name) => name.length > 0)

  // Se tudo foi sanitizado para vazio → fallback
  if (sanitized.length === 0) {
    return ["Max"]
  }

  return sanitized
}
