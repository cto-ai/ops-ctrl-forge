
import { isAbsolute, dirname } from 'path'
import AggregateError from 'es-aggregate-error'
import split from 'split2'
import leven from 'leven'
import join from 'unijoin'
import parseGhUrl from 'parse-github-url'
import got from 'got'
import account from '@cto.ai/ops-ctrl-account'
import { MANIFEST_NAME } from '@cto.ai/ops-constants'
import { normalize, validate, parse } from './lib/manifest.js'
import { parseDockerOutput, buildImage, checkDocker } from './lib/docker.js'
import { ForgeError } from './lib/advise.js'
import { kJobPath } from './lib/symbols.js'
import unpack from './lib/unpack.js'
import createJobs from './lib/jobs.js'
import render from './lib/render.js'

export default forge
export * as ERRORS from './lib/errors.js'
export * as WARNINGS from './lib/warnings.js'
export { ForgeError } from './lib/advise.js'

const templates = join(dirname(import.meta.url), 'templates')

function forge ({ dockerMissingRetry = false } = {}) {
  async function * init ({ from = 'node', to, kind = 'command', name, description, version = '0.1.0' }) {
    const targets = { 'Node.js': 'node', node: 'node', Golang: 'golang', Python: 'python', Bash: 'bash' }
    let remote
    try { remote = !!new URL(from) } catch { remote = false }
    let template = null
    if (remote === false) {
      const kinds = new Set(['command', 'service'])
      if (kinds.has(kind) === false) throw new ForgeError('ERR_KIND_NOT_RECOGNIZED', kind)
      const { match, distance } = Object.keys(targets).reduce((result, name) => {
        const distance = leven(name, from)
        return distance < result.distance ? { distance, match: name } : result
      }, { distance: Infinity })

      if (!match || distance > 7) throw new ForgeError('ERR_TEMPLATE_NOT_FOUND', from)

      const target = targets[match]
      template = join(templates, kind, target)
    } else {
      const { owner, name, branch } = parseGhUrl(from)
      yield { label: 'downloading', from }
      try {
        template = await unpack(got.stream(
          `https://codeload.github.com/${owner}/${name}/tar.gz/${branch}`
        ), { abstraction: 'stream' })
      } catch (err) {
        throw new ForgeError('ERR_TEMPLATE_DOWNLOAD_FAILED', { from, err })
      }
    }

    await render(template, to, {
      pkg: name,
      name: `${name}:${version}`,
      version,
      description
    })

    return { label: 'initialized', dir: to }
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
        const { stream, status, errorDetail } = parseDockerOutput(output)
        if (errorDetail) throw new ForgeError('ERR_DOCKER_BUILD_FAILURE', errorDetail)
        yield {
          type: status ? 'status' : 'stream',
          label: 'docker-output',
          output: status || stream
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
