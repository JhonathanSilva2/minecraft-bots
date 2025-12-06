import { promises as fs } from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default class LocationManager {
  constructor(bot, logger) {
    this.bot = bot
    this.logger = logger

    this.filePath = path.join(__dirname, "locations.json")
    this.locations = {}
    this.loaded = false
    this.loadingPromise = null
  }

  // ======================================================
  // GARANTE QUE O ARQUIVO EXISTE
  // ======================================================
  async _ensureFile() {
    try {
      await fs.access(this.filePath)
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({}, null, 2), "utf8")
    }
  }

  // ======================================================
  // CARREGA DO DISCO
  // ======================================================
  async _loadFromDisk() {
    await this._ensureFile()

    try {
      const raw = await fs.readFile(this.filePath, "utf8")
      const parsed = raw.trim() ? JSON.parse(raw) : {}
      this.locations = parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      this.locations = {}
      await fs.writeFile(this.filePath, JSON.stringify({}, null, 2), "utf8")
    }

    this.loaded = true
  }

  // ======================================================
  // GARANTE QUE ESTÁ CARREGADO (LAZY LOAD)
  // ======================================================
  async _ensureLoaded() {
    if (this.loaded) return

    if (!this.loadingPromise) {
      this.loadingPromise = this._loadFromDisk().finally(() => {
        this.loadingPromise = null
      })
    }

    await this.loadingPromise
  }

  // ======================================================
  // API PÚBLICA
  // ======================================================

  async loadAll() {
    await this._ensureLoaded()
    return { ...this.locations }
  }

  async saveAll() {
    await this._ensureLoaded()
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.locations, null, 2),
      "utf8"
    )
  }

  async set(name, data) {
    await this._ensureLoaded()
    this.locations[name] = data
    await this.saveAll()
    this.logger?.log(
      "locations",
      `Salvo local '${name}' → ${JSON.stringify(data)}`
    )
  }

  async get(name) {
    await this._ensureLoaded()
    return this.locations[name]
  }

  async has(name) {
    await this._ensureLoaded()
    return Object.prototype.hasOwnProperty.call(this.locations, name)
  }

  async remove(name) {
    await this._ensureLoaded()
    if (this.locations[name]) {
      delete this.locations[name]
      await this.saveAll()
      this.logger?.log("locations", `Local removido '${name}'`)
    }
  }
}
