import { createWoodcutter } from "./woodcutter.js"
import { createEstoquista } from "./estoquista.js"

export const professionRegistry = {
  lenhador: createWoodcutter,
  estoquista: createEstoquista
}
