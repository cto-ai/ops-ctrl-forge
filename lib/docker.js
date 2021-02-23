import fs from 'fs'
import Docker from 'dockerode'
import { ForgeError } from './advise.js'

const { stat } = fs.promises
const { platform } = process
const {
  DOCKER_SOCKET = (platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock')
} = process.env

export default Docker

export const socketPath = DOCKER_SOCKET

export async function * checkDocker ({ found = false, foundRetries = 0, pingRetries = 0 } = {}) {
  if (found === false) {
    try {
      await stat(DOCKER_SOCKET)
    } catch (err) {
      foundRetries++
      const retry = yield { label: 'docker-not-found', retries: foundRetries }
      yield
      if (retry) yield * checkDocker({ foundRetries })
    }
  }
  try {
    await new Docker({ socketPath }).ping()
  } catch {
    pingRetries++
    const retry = yield { label: 'docker-not-running', retries: pingRetries }
    yield
    if (retry) yield * checkDocker({ found: true, pingRetries })
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
