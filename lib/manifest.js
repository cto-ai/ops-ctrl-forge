import fs from 'fs'
import yaml from 'yaml'
import got from 'got'
import { SDK } from '@cto.ai/ops-constants'
import { ForgeError, warning } from './advise.js'
import { kWarnings } from './symbols.js'

const { readFile } = fs.promises

const nameRx = /^[a-zA-Z0-9-_]+$/
const versionRx = /^[\w][\w.-]{0,127}$/
const domainRx = /^(\*\.)?(([a-zA-Z0-9_]|[a-zA-Z0-9_][a-zA-Z0-9_-]*[a-zA-Z0-9_])\.)*([A-Za-z0-9_]|[A-Za-z0-9_][A-Za-z0-9_-]*[A-Za-z0-9_](\.?))$/

const format = (type, warnings = []) => {
  return (item) => {
    let { name = '', version } = item
    if (!version) {
      [name, version] = name.split(':')
      if (type === 'command') {
        version = '0.1.0'
        warnings.push(warning('WRN_VERSION_FIELD_MISSING', type, name, version))
      }
    }
    const remap = Object.fromEntries(Object.entries(item).map(([k, v]) => {
      if (k === 'public') return ['isPublic', v]
      if (k === 'domain') return ['cname', v]
      return [k, v]
    }))
    return {
      ...remap,
      type,
      name,
      version
    }
  }
}

export async function fetch (api, tokens, { team, name, version }) {
  try {
    const { body } = await got(`${api}/private/teams/${team}/ops/${name}${version ? `/version/${version}` : ''}`, {
      headers: {
        Accept: 'application/json',
        Authorization: tokens.accessToken
      }
    })
    const { data: manifest } = body
    if (!manifest) throw new ForgeError('ERR_REMOTE_OP_NOT_FOUND')
    manifest.isPublished = true
    return manifest
  } catch (err) {
    if (err.response && err.response.statusCode === 404) {
      throw new ForgeError('ERR_REMOTE_OP_NOT_FOUND')
    }
    throw err
  }
}

export const parse = async (path) => {
  return yaml.parse(await readFile(path, 'utf-8'))
}

export const normalize = (manifest, select) => {
  const {
    version,
    ops = [],
    pipelines = [],
    commands = [],
    services = []
  } = manifest
  const warnings = ops.length > 0 ? [warning('WRN_OPS_FIELD_DEPRECATED')] : []
  const pick = select ? ({ name }) => select.has(name) : () => true

  return {
    version,
    commands: [...ops, ...commands].map(format('command', warnings)).filter(pick),
    pipelines: pipelines.map(format('pipeline')).filter(pick),
    services: services.map(format('service')).filter(pick),
    [kWarnings]: warnings
  }
}

export const validate = (manifest) => {
  const { commands, pipelines, services } = manifest
  const errors = [
    ...validate.commands(commands),
    ...validate.pipelines(pipelines),
    ...validate.services(services),
    ...validate.env([...commands, ...pipelines, ...services])
  ]
  const warnings = manifest[kWarnings]
  if (manifest.sdk !== SDK) { return { errors, warnings } }
}

validate.common = (items) => {
  return items.reduce((errors, { name, version, description }) => {
    if (!name || nameRx.test(name) === false) {
      errors.push(new ForgeError('ERR_NAME_INVALID'))
    }
    if (!version || versionRx.test(version) === false) {
      errors.push(new ForgeError('ERR_VERSION_INVALID'))
    }
    if (typeof description !== 'string') errors.push(new ForgeError('ERR_DESC_INVALID'))
    return errors
  }, [])
}

validate.commands = (items) => {
  return items.reduce((errors, { name, run, isPublic }) => {
    if (typeof run !== 'string') errors.push(new ForgeError('ERR_NO_RUN', name, 'command'))
    if (typeof isPublic !== 'boolean') errors.push(new ForgeError('ERR_NO_PUBLIC'))
    return errors
  }, validate.common(items))
}

validate.pipelines = (items) => {
  return items.reduce((errors, { version, jobs }) => {
    if (Array.isArray(jobs) === false || jobs.length < 1) {
      errors.push(new ForgeError('ERR_PIPELINE_JOBS_INVALID'))
    } else {
      if (jobs.some(({ name }) => !name)) {
        errors.push(new ForgeError('ERR_PIPELINE_JOB_NAME_INVALID'))
      }
      if (jobs.some(({ description }) => !description)) {
        errors.push(new ForgeError('ERR_PIPELINE_JOB_DESC_INVALID'))
      }
    }
    return errors
  }, validate.common(items))
}

validate.services = (items) => {
  return items.reduce((errors, { name, run, cname }) => {
    if (!run || typeof run !== 'string') {
      errors.push(new ForgeError('ERR_NO_RUN', name, 'service'))
    }
    if (cname && domainRx.test(cname) === false) {
      errors.push(new ForgeError('ERR_SERVICE_DOMAIN_INVALID', cname))
    }
    return errors
  }, validate.common(items))
}

validate.env = (items) => {
  const toErrors = (e) => {
    if (typeof e !== 'string') return false
    if (e.includes('=') === false) return false
    const [key, value] = e.split('=')
    if (key.trim() === '' || value.trim() === '') {
      return new ForgeError('ERR_ENV_VAR_INVALID', e)
    }
  }
  return items.reduce((errors, { env = [] }) => {
    return [
      ...errors,
      ...env.map(toErrors).filter(Boolean)
    ]
  }, [])
}
