import { promises as fs } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const chestsFile = path.join(__dirname, "chests.json")

let chests = {}
let loaded = false
let loadingPromise = null

async function ensureFileExists() {
  try {
    await fs.access(chestsFile)
    return
  } catch {
    await fs.writeFile(chestsFile, JSON.stringify({}, null, 2), "utf8")
  }
}

async function readFromDisk() {
  await ensureFileExists()

  try {
    const raw = await fs.readFile(chestsFile, "utf8")
    const parsed = raw.trim() ? JSON.parse(raw) : {}
    chests = parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    chests = {}
    await fs.writeFile(chestsFile, JSON.stringify(chests, null, 2), "utf8")
  }

  loaded = true
}

async function ensureLoaded() {
  if (loaded) return
  if (!loadingPromise) {
    loadingPromise = readFromDisk().finally(() => {
      loadingPromise = null
    })
  }
  await loadingPromise
}

export async function loadChests() {
  await ensureLoaded()
  return { ...chests }
}

export async function saveChests() {
  await ensureLoaded()
  await fs.writeFile(chestsFile, JSON.stringify(chests, null, 2), "utf8")
}

/**
 * Registra ou atualiza o baú associado a um item.
 * coords: { x, y, z }
 */
export async function setChest(itemName, coords) {
  await ensureLoaded()
  chests[itemName] = coords
  await saveChests()
}

export async function getChest(itemName) {
  await ensureLoaded()
  return chests[itemName] || null
}

export async function deleteChest(itemName) {
  await ensureLoaded()
  delete chests[itemName]
  await saveChests()
}

export async function listChests() {
  await ensureLoaded()
  return Object.keys(chests)
}
