import fs from 'fs'
import path from 'path'
import { PassThrough } from 'stream'
import { join } from 'desm'
import { promisify } from 'util'
import { tmpdir } from 'os'
import generify from 'generify'
import tar from 'tar'
const { mkdtemp } = fs.promises
const tmp = tmpdir()
const render = promisify(generify)

export const mockOp = async (manifest, { locals = {}, ns = 'op', archive = false, compress = false } = {}) => {
  locals.manifest = manifest
  const src = join(import.meta.url, 'fixtures', ns)
  const dest = await mkdtemp(path.join(tmp, 'ops-ctrl-forge-test'))
  await render(src, dest, locals)
  if (archive) {
    const tarDest = await mkdtemp(path.join(tmp, 'ops-ctrl-forge-test'))
    const file = path.join(tarDest, 'op.tar')
    await tar.c({ file, cwd: dest, gzip: compress }, ['.'])
    return file
  }
  return dest
}

export const happyMocks = (opts = {}) => {
  const { mocks = {} } = opts

  const fsMock = {
    ...fs,
    ...(mocks.fs || {}),
    promises: {
      ...fs.promises,
      async stat () {
        if (opts.stat) return opts.stat()
      },
      ...(mocks.fs ? (mocks.fs.promises || {}) : {})
    }
  }

  return {
    '@cto.ai/ops-ctrl-account': {
      validate () { return opts.validate ? opts.validate() : true }
    },
    dockerode: {
      default: class Docker {
        constructor (...args) {
          if (opts.dockerCtor) return opts.dockerCtor.call(this, ...args)
        }

        async ping () { if (opts.ping) return opts.ping() }
        async buildImage (...args) {
          if (opts.buildImage) return opts.buildImage.call(this, ...args)
          return new PassThrough()
        }
      }
    },
    ...mocks,
    fs: fsMock
  }
}
