import fs from 'fs'
import Docker from 'dockerode'
import { ForgeError, warning } from './advise.js'

const { stat } = fs.promises
const { platform } = process
const {
  DOCKER_SOCKET = (platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock')
} = process.env

export default Docker

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
