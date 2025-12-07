import { createWoodcutter } from "./woodcutter.js"
import { createEstoquista } from "./estoquista.js"
import { createCrafter } from "./crafter.js"
import { createMiner } from "./miner.js"

export const professionRegistry = {
  lenhador: createWoodcutter,
  estoquista: createEstoquista,
  crafter: createCrafter,
  minerador: createMiner
}
