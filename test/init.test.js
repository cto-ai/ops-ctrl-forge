import { test, mockalicious } from 'tapx'
import { ERRORS } from '../index.js'
const load = mockalicious(import.meta.url)

test('init is not implemented', async ({ rejects }) => {
  const createForge = await load('..')
  const forge = createForge()
  await rejects(forge.init().next(), RegExp(ERRORS.ERR_NOT_IMPLEMENTED))
})
