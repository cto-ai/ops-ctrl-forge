
import { isAbsolute, join } from 'path'
import AggregateError from 'aggregate-error'
import Jss from 'json-split-stream'
import account from '@cto.ai/ops-ctrl-account'
import { MANIFEST_NAME } from '@cto.ai/ops-constants'
import { normalize, validate, parse } from './lib/manifest.js'
import { parseDockerOutput, buildImage, checkDocker } from './lib/docker.js'
import { ForgeError } from './lib/advise.js'
import { kJobPath } from './lib/symbols.js'
import unpack from './lib/unpack.js'
import createJobs from './lib/jobs.js'

export default forge
export * from './lib/errors.js'

function forge ({ dockerMissingRetry = false } = {}) {
  async function * init () {
    throw new ForgeError('ERR_NOT_IMPLEMENTED')
  }

  async function * build ({ op, url, registry, select = [], tokens, team, cache = true } = {}) {
    if (!op) throw new ForgeError('ERR_OP_OPTION_REQUIRED')
    if (!url) throw new ForgeError('ERR_URL_OPTION_REQUIRED')
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
        throw new ForgeError('ERR_OP_OPTION_PATH_MUST_BE_ABSOLUTE')
      }
    } else {
      throw new ForgeError('ERR_OP_OPTION_INVALID_')
    }

    select = new Set(select)
    if (select.size < 1) throw new ForgeError('ERR_SELECT_OPTION_INVALID')

    if (account.validate(tokens) === false) {
      throw new ForgeError('ERR_TOKENS_EXPIRED')
    }

    if (dockerMissingRetry) {
      yield * checkDocker()
    } else {
      for await (const { label } of checkDocker()) {
        if (label === 'docker-not-found') {
          throw new ForgeError('ERR_DOCKER_NOT_FOUND')
        }
        if (label === 'docker-not-running') {
          throw new ForgeError('ERR_DOCKER_NOT_RUNNING')
        }
      }
    }

    const manifest = normalize(await parse(join(op, MANIFEST_NAME)), select)

    const { errors, warnings } = validate(manifest)

    yield * warnings

    if (errors.length) throw new AggregateError(errors)

    const { commands, workflows, services, pipelines } = manifest

    const jobs = await createJobs(url, tokens, pipelines)

    const ops = [...commands, ...workflows, ...jobs, ...services]
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
      for await (const output of building.pipe(new Jss())) {
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
