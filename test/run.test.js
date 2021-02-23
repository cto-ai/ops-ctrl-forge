import { test, mockalicious } from 'tapx'
import { ERR_NOT_IMPLEMENTED } from '../index.js'
const load = mockalicious(import.meta.url)

test('run is not implemented', async ({ rejects }) => {
  const createForge = await load('..')
  const forge = createForge()
  await rejects(forge.run().next(), RegExp(ERR_NOT_IMPLEMENTED))
})
