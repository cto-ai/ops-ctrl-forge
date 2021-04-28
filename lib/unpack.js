import fs from 'fs'
import stream from 'stream'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import tar from 'tar'
const tmp = tmpdir()
const { mkdtemp } = fs.promises
const finished = promisify(stream.finished)
const pipeline = promisify(stream.pipeline)

export default async function (src, { abstraction }) {
  const cwd = await mkdtemp(join(tmp, 'ops-ctrl-forge-unpacked-tar-'))
  const unpacker = tar.x({ cwd })
  if (abstraction === 'stream') {
    src.pipe(unpacker)
    await pipeline(src, unpacker)
  }
  if (abstraction === 'buffer') {
    unpacker.end(src)
    await finished(unpacker)
  }
  return cwd
}
