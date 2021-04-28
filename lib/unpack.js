import fs from 'fs'
import stream from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import tar from 'tar'
const tmp = tmpdir()
const { mkdtemp } = fs.promises
const finished = promisify(stream.finished)

export default async function (src, { abstraction }) {
  const cwd = await mkdtemp(join(tmp, 'ops-ctrl-forge-unpacked-tar-'))
  const unpacker = tar.x({ cwd })
  const eos = finished(unpacker)
  if (abstraction === 'stream') {
    src.pipe(unpacker)
    await finished(src)
  }
  if (abstraction === 'buffer') {
    unpacker.end(src)
  }
  await eos
  return cwd
}
