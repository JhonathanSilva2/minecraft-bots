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
  // SISTEMA DE ARQUIVOS (PERSISTÊNCIA)
  // ======================================================

  async _ensureFile() {
    try {
      await fs.access(this.filePath)
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({}, null, 2), "utf8")
    }
  }

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

  async _ensureLoaded() {
    if (this.loaded) return
    if (!this.loadingPromise) {
      this.loadingPromise = this._loadFromDisk().finally(() => {
        this.loadingPromise = null
      })
    }
    await this.loadingPromise
  }

  async saveAll() {
    await this._ensureLoaded()
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.locations, null, 2),
      "utf8"
    )
  }

  // ======================================================
  // API PÚBLICA (CRUD)
  // ======================================================

  async loadAll() {
    await this._ensureLoaded()
    return { ...this.locations }
  }

  async set(name, data) {
    await this._ensureLoaded()
    this.locations[name] = data
    await this.saveAll()
    this.logger?.log("locations", `Salvo local '${name}' → ${JSON.stringify(data)}`)
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

  // ======================================================
  // GERENCIAMENTO DE ZONAS (REGIÕES 3D)
  // ======================================================

  /**
   * Salva uma região cubóide baseada em dois cantos (estilo WorldEdit).
   * Calcula automaticamente o min/max para criar a bounding box.
   */
  async setZone(name, corner1, corner2) {
    const minX = Math.min(corner1.x, corner2.x)
    const maxX = Math.max(corner1.x, corner2.x)
    const minY = Math.min(corner1.y, corner2.y)
    const maxY = Math.max(corner1.y, corner2.y)
    const minZ = Math.min(corner1.z, corner2.z)
    const maxZ = Math.max(corner1.z, corner2.z)

    const zoneData = {
        type: 'zone',
        x: minX, y: minY, z: minZ, // Canto inferior noroeste (origem)
        width: maxX - minX + 1,    // Tamanho X
        height: maxY - minY + 1,   // Tamanho Y (Altura)
        depth: maxZ - minZ + 1,    // Tamanho Z
        center: {
            x: (minX + maxX) / 2,
            y: minY, 
            z: (minZ + maxZ) / 2
        }
    }
    
    await this.set(name, zoneData)
  }

  /**
   * Verifica se uma posição está dentro de uma zona salva.
   */
  async isInside(name, position) {
    const zone = await this.get(name)
    if (!zone) return false
    
    // Verifica colisão AABB (Axis-Aligned Bounding Box)
    return position.x >= zone.x && position.x < zone.x + zone.width &&
           position.y >= zone.y && position.y < zone.y + zone.height &&
           position.z >= zone.z && position.z < zone.z + zone.depth
  }
}