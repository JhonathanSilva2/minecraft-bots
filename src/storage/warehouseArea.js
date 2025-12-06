let warehouseArea = null

export function setWarehouseArea(area) {
  warehouseArea = area
}

export function getWarehouseArea() {
  return warehouseArea
}

export function hasWarehouseArea() {
  return Boolean(warehouseArea)
}

export function isInsideWarehouse(pos) {
  if (!warehouseArea || !pos) return false

  const { origin, width, depth } = warehouseArea
  const halfW = width / 2
  const halfD = depth / 2

  const dx = pos.x - origin.x
  const dz = pos.z - origin.z

  return Math.abs(dx) <= halfW && Math.abs(dz) <= halfD
}
