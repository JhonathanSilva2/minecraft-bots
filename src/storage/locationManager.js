import { promises as fs } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const locationsFile = path.join(__dirname, "locations.json")

let locations = {}
let loaded = false
let loadingPromise = null

async function ensureFileExists() {
  try {
    await fs.access(locationsFile)
    return
  } catch {
    await fs.writeFile(locationsFile, JSON.stringify({}, null, 2), "utf8")
  }
}

async function readFromDisk() {
  await ensureFileExists()

  try {
    const raw = await fs.readFile(locationsFile, "utf8")
    const parsed = raw.trim() ? JSON.parse(raw) : {}
    locations = parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    locations = {}
    await fs.writeFile(locationsFile, JSON.stringify(locations, null, 2), "utf8")
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

export async function loadLocations() {
  await ensureLoaded()
  return { ...locations }
}

export async function saveLocations() {
  await ensureLoaded()
  await fs.writeFile(locationsFile, JSON.stringify(locations, null, 2), "utf8")
}

export async function setLocation(name, data) {
  await ensureLoaded()
  locations[name] = data
  await saveLocations()
}

export async function getLocation(name) {
  await ensureLoaded()
  return locations[name]
}

export async function hasLocation(name) {
  await ensureLoaded()
  return Object.prototype.hasOwnProperty.call(locations, name)
}
