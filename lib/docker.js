import fs from 'fs'
import Docker from 'dockerode'
import got from 'got'
import { ForgeError, warning } from './advise.js'

const { stat } = fs.promises
const { platform } = process
const {
  DOCKER_SOCKET = (platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock')
} = process.env

export const socketPath = DOCKER_SOCKET

export async function * checkDocker ({ found = false, foundRetries = 0, pingRetries = 0, attemptRetry = true } = {}) {
  if (found === false) {
    try {
      await stat(DOCKER_SOCKET)
    } catch {
      if (attemptRetry === false) throw new ForgeError('ERR_DOCKER_NOT_FOUND')
      const response = yield { ...warning('WRN_DOCKER_NOT_FOUND'), isDockerProblem: true, retries: foundRetries }
      // this extra yield allows iter.next to be called in a for await of loop
      // without removing any upcoming items from the loop
      yield {}
      if (response.retry) yield * checkDocker({ foundRetries: foundRetries + 1 })
      else throw new ForgeError('ERR_DOCKER_NOT_FOUND')
    }
  }
  try {
    await new Docker({ socketPath }).ping()
  } catch {
    if (attemptRetry === false) throw new ForgeError('ERR_DOCKER_NOT_RUNNING')
    const response = yield { ...warning('WRN_DOCKER_NOT_RUNNING'), isDockerProblem: true, retries: pingRetries }
    // this extra yield allows iter.next to be called in a for await of loop
    // without removing any upcoming items from the loop
    yield {}
    if (response.retry) yield * checkDocker({ found: true, pingRetries: pingRetries + 1 })
    else throw new ForgeError('ERR_DOCKER_NOT_RUNNING')
  }
}

export const parseDockerOutput = (line) => {
  try {
    return JSON.parse(line)
  } catch (err) {
    throw new ForgeError('ERR_DOCKER_OUTPUT_CORRUPT', err)
  }
}

export const buildImage = async (...args) => {
  const docker = new Docker({ socketPath })
  try {
    return await docker.buildImage(...args)
  } catch (err) {
    throw new ForgeError('ERR_DOCKER_BUILD_FAILURE', err)
  }
}

export const createContainer = async (...args) => {
  const docker = new Docker({ socketPath })
  try {
    return await docker.createContainer(...args)
  } catch (err) {
    throw new ForgeError('ERR_DOCKER_CONTAINER_FAILURE', err)
  }
}

export async function * getImage (api, registry, tokens, team, manifest) {
  const { isPublished, isPublic, id, version, name } = manifest
  const tag = `${(isPublic ? 'public.' : '')}${team}${isPublished ? id : name}:${version}`
  yield tag
  if (await localImage(tag)) {
    yield { status: 'local image acquired', local: true }
  }
  const { body } = await got.post(`${api}/private/registry/token`, {
    json: {
      teamName: team,
      opName: name,
      opVersion: version,
      pullAccess: true,
      pushAccess: false
    },
    headers: {
      Accept: 'application/json',
      Authorization: tokens.accessToken
    }
  })
  const {
    teamName = '',
    robotAccountName = '',
    token = '',
    robotID
  } = body
  const projectFullName = `${registry}/${teamName}`
  const projectUrl = `https://${projectFullName}`
  yield * pullImage(tag, {
    authconfig: {
      username: robotAccountName,
      password: token,
      serveraddress: projectUrl
    },
    projectFullName,
    robotID
  })
}

export async function * pullImage (op, authconfig) {
  const docker = new Docker({ socketPath })
  try {
    const stream = await docker.pull(op.image, { authconfig })
    yield * stream
  } catch (err) {
    throw new ForgeError('ERR_REGISTRY_PULL_FAILED', err)
  }
}

export const localImage = async (tag) => {
  const docker = new Docker({ socketPath })
  const list = await docker.listImages()
  return list.map(this.imageFilterPredicate(tag)).find((repoTag) => !!repoTag)
}
