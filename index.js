
import { isAbsolute, dirname, parse as parsePath } from 'path'
import AggregateError from 'es-aggregate-error'
import split from 'split2'
import leven from 'leven'
import join from 'unijoin'
import parseGhUrl from 'parse-github-url'
import got from 'got'
import { v4 as uuid } from 'uuid'
import account from '@cto.ai/ops-ctrl-account'
import { MANIFEST_NAME, DAEMON } from '@cto.ai/ops-constants'
import { normalize, validate, parse, fetch } from './lib/manifest.js'
import { parseDockerOutput, buildImage, createContainer, getImage, checkDocker } from './lib/docker.js'
import { ForgeError, warning } from './lib/advise.js'
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

  async function * run ({ op, api, registry, select, tokens, team, cache = true, prebuild = false } = {}) {
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
    if (typeof op !== 'string') throw new ForgeError('ERR_OP_OPTION_INVALID')

    if (typeof select !== 'string') {
      throw new ForgeError('ERR_SELECT_OPTION_INVALID')
    }

    const { dir: isPath } = parsePath(op)
    if (isPath && isAbsolute(op) === false) {
      throw new ForgeError('ERR_OP_OPTION_PATH_MUST_BE_ABSOLUTE', op)
    }

    if (prebuild) yield * build({ op, api, registry, select: [select], tokens, team, cache })

    const manifest = isPath
      ? normalize(await parse(join(op, MANIFEST_NAME)), [select])
      : normalize(await fetch(api, tokens, op), [select])

    const { errors, warnings } = validate(manifest)

    yield * warnings

    if (errors.length) throw new AggregateError(errors)

    const { commands: [command], services: [service], pipelines: [pipeline] } = manifest
    const selected = command || service
    if (pipeline) {
      // const published = 'steps' in pipeline
      // TODO PIPELINE
    } else if (selected) {
      const { bind = [], mountCwd = false, mountHome = false } = selected
      if (mountCwd || mountHome || bind.length > 0) {
        yield warning('WRN_OP_MOUNTS_DIRECTORIES')
        if (mountCwd) yield warning('WRN_OP_MOUNTS_CWD')
        if (mountHome) yield warning('WRN_OP_MOUNTS_HOME')
        if (bind.length > 0) yield warning('WRN_OP_MOUNTS_HOME', bind)
      }
      yield { label: 'prerun' }
      const { name, description, version } = selected
      const id = uuid()
      yield * checkDocker({ attemptRetry: dockerMissingRetry })
      yield { label: 'starting', id, name, version }
      if (selected.port) {
        // todo check local port is available
      }

      const image = await getImage(registry, tokens, team, manifest)
      const { value: tag } = await image.next()
      for await (const { status, progressDetail, local } of image) {
        if (local) break
        yield {
          type: 'stream',
          label: 'docker-output',
          output: status,
          progress: progressDetail
        }
      }

      const options = {
        AttachStderr: true,
        AttachStdin: true,
        AttachStdout: true,
        Cmd: [DAEMON, manifest.run],
        Env: op.env,
        // WorkingDir, // todo
        HostConfig: {
          Binds: op.bind,
          NetworkMode: op.network
          // ExposedPorts,  //todo
          // PortBindings //todo
        },
        Image: tag,
        OpenStdin: true,
        StdinOnce: false,
        Tty: true,
        Volumes: {},
        VolumesFrom: []

      }
      const container = await createContainer(options)
      const stream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true
      })

      yield {
        label: 'started',
        container,
        stream,
        id,
        name,
        description,
        version,
        team,
        image: tag
        // namespace, //todo
      }
    } else {
      throw new ForgeError('ERR_SELECT_OPTIONS_INVALID')
    }
  }

  return { init, build, run }
}
