import { promises as fs } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const recipesPath = path.join(__dirname, "recipes.json")

let recipesCache = null

export async function loadRecipes() {
  try {
    if (recipesCache) return recipesCache

    const raw = await fs.readFile(recipesPath, "utf8")
    const parsed = JSON.parse(raw)

    recipesCache = parsed
    return parsed
  } catch (err) {
    console.error("[recipesLoader] ERRO ao carregar recipes.json:", err)
    throw err
  }
}
