
import { isAbsolute, join } from 'path'
import AggregateError from 'es-aggregate-error'
import split from 'split2'
import account from '@cto.ai/ops-ctrl-account'
import { MANIFEST_NAME } from '@cto.ai/ops-constants'
import { normalize, validate, parse } from './lib/manifest.js'
import { parseDockerOutput, buildImage, checkDocker } from './lib/docker.js'
import { ForgeError } from './lib/advise.js'
import { kJobPath } from './lib/symbols.js'
import unpack from './lib/unpack.js'
import createJobs from './lib/jobs.js'

export default forge
export * as ERRORS from './lib/errors.js'
export * as WARNINGS from './lib/warnings.js'

function forge ({ dockerMissingRetry = false } = {}) {
  async function * init () {
    throw new ForgeError('ERR_NOT_IMPLEMENTED')
  }

  async function * build ({ op, api, registry, select = [], tokens, team, cache = true } = {}) {
    if (!op) throw new ForgeError('ERR_OP_OPTION_REQUIRED')
    if (!api) throw new ForgeError('ERR_API_OPTION_REQUIRED')
    if (!registry) throw new ForgeError('ERR_REGISTRY_OPTION_REQUIRED')
    registry = registry.replace(/http(s?):\/\//, '')

    if (typeof op === 'object') {
      if (Buffer.isBuffer(op) || typeof op.pipe === 'function') {
        const abstraction = Buffer.isBuffer(op) ? 'buffer' : 'stream'
        op = await unpack(op, { abstraction })
      }
    }
    if (typeof op === 'string') {
      if (isAbsolute(op) === false) {
        throw new ForgeError('ERR_OP_OPTION_PATH_MUST_BE_ABSOLUTE', op)
      }
    } else {
      throw new ForgeError('ERR_OP_OPTION_INVALID')
    }

    if (Array.isArray(select) === false) {
      throw new ForgeError('ERR_SELECT_OPTION_INVALID')
    }

    select = new Set(select)
    if (select.size < 1) throw new ForgeError('ERR_SELECT_OPTION_INVALID')

    try {
      if (account.validate(tokens) === false) {
        throw new ForgeError('ERR_TOKENS_EXPIRED')
      }
    } catch ({ message }) {
      throw new ForgeError('ERR_TOKENS_INVALID', message)
    }

    yield * checkDocker({ attemptRetry: dockerMissingRetry })

    const manifest = normalize(await parse(join(op, MANIFEST_NAME)), select)

    const { errors, warnings } = validate(manifest)

    yield * warnings

    if (errors.length) throw new AggregateError(errors)

    const { commands, services, pipelines } = manifest

    const jobs = await createJobs(api, tokens, pipelines)

    const ops = [...commands, ...jobs, ...services]
    if (ops.length < 1) throw new ForgeError('ERR_SELECT_OPTION_INVALID')

    for (const item of ops) {
      const { name, version, isPublic, src, type } = item
      yield { label: 'building', name, version }
      const tag = `${registry}/${isPublic ? 'public.' : ''}${team}/${name}:${version}`
      const context = item[kJobPath] || op
      const building = await buildImage(
        { context, src },
        { nocache: !cache, t: tag, pull: true }
      )
      for await (const output of building.pipe(split())) {
        const { stream, errorDetail } = parseDockerOutput(output)
        if (errorDetail) throw new ForgeError('ERR_DOCKER_BUILD_FAILURE', errorDetail)
        yield {
          label: 'docker-output',
          output: stream
        }
      }

      yield {
        label: 'built',
        type,
        name,
        version,
        isPublic,
        tag,
        run: (type === 'job') ? item.jobDir : name,
        publish: context
      }
    }
  }

  async function * run () {
    throw new ForgeError('ERR_NOT_IMPLEMENTED')
  }

  return { init, build, run }
}
