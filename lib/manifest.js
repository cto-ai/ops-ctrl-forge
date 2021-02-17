import fs from 'fs'
import yaml from 'yaml'
import { ForgeError, warning } from './advise.js'
import { kWarnings } from './symbols.js'

const { readFile } = fs.promises

const nameRx = /^[a-zA-Z0-9-_]+$/
const versionRx = /^[\w][\w.-]{0,127}$/
const domainRx = /^(\*\.)?(([a-zA-Z0-9_]|[a-zA-Z0-9_][a-zA-Z0-9_-]*[a-zA-Z0-9_])\.)*([A-Za-z0-9_]|[A-Za-z0-9_][A-Za-z0-9_-]*[A-Za-z0-9_](\.?))$/

const formatService = ({ name: nv = '', description, env, run, port, domain }) => {
  const [name, version] = nv.split(':')
  return {
    type: 'service',
    name,
    version,
    description,
    env,
    run,
    port,
    cname: domain,
    platformVersion: '',
    isPublic: false,
    sdk: '2',
    bind: [],
    mountCwd: false,
    mountHome: false,
    image: ''
  }
}

const format = (type, warnings = []) => {
  if (type === 'service') return formatService
  return (item) => {
    if (typeof item !== 'object' || item === null) return {}
    const { name: nameVersion = '' } = item
    let [name, version] = nameVersion.split(':')
    if (type === 'command' || type === 'workflow') {
      version = '0.1.0'
      warnings.push(warning('WRN_VERSION_FIELD_MISSING'))
    }
    const remap = Object.fromEntries(Object.entries(item).map(([k, v]) => {
      if (k === 'public') return ['isPublic', v]
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

export const parse = async (path) => yaml.parse(await readFile(path))

export const normalize = (manifest, select) => {
  const {
    version,
    ops = [],
    workflows = [],
    pipelines = [],
    commands = [],
    services = []
  } = manifest
  const warnings = ops.length > 0 ? [warning('WRN_OPS_FIELD_DEPRECATED')] : []
  const pick = ({ name }) => select.has(name)

  return {
    version,
    commands: [...ops, ...commands].filter(pick).map(format('command', warnings)),
    workflows: workflows.filter(pick).map(format('workflow', warnings)),
    pipelines: pipelines.filter(pick).map(format('pipeline')),
    services: services.filter(pick).map(format('service')),
    [kWarnings]: warnings
  }
}

export const validate = (manifest) => {
  const { commands, workflows, pipelines, services } = manifest
  const errors = [
    ...validate.commands(commands),
    ...validate.workflows(workflows),
    ...validate.pipelines(pipelines),
    ...validate.services(services),
    ...validate.env([...commands, ...workflows, ...pipelines, ...services])
  ]
  const warnings = manifest[kWarnings]
  return { errors, warnings }
}

validate.common = (items) => {
  return items.reduce((errors, { name, version, description, isPublic }) => {
    if (typeof name !== 'string' || nameRx.test(name) === false) {
      errors.push(new ForgeError('ERR_OP_NAME_INVALID'))
    }
    if (versionRx.test(version) === false) {
      errors.push(new ForgeError('ERR_VERSION_INVALID'))
    }
    if (typeof description !== 'string') errors.push(new ForgeError('ERR_OP_DESC_INVALID'))
    if (typeof isPublic !== 'boolean') errors.push(new ForgeError('ERR_NO_PUBLIC'))
    return errors
  }, [])
}

validate.commands = (items) => {
  return items.reduce((errors, { run }) => {
    if (typeof run !== 'string') errors.push(new ForgeError('ERR_NO_RUN'))
    return errors
  }, validate.commom(items))
}

validate.workflows = (items) => {
  return items.reduce((errors, { steps }) => {
    if (Array.isArray(steps) === false) errors.push(new ForgeError('ERR_NO_STEPS'))
    else if (steps.length < 1) errors.push(new ForgeError('ERR_NO_STEP'))
    else if (steps.some((step) => typeof step !== 'string' || step === '')) {
      errors.push(new ForgeError('ERR_STEP_INVALID'))
    }
    return errors
  }, validate.commom(items))
}

validate.pipelines = (items) => {
  return items.reduce((errors, { version, jobs }) => {
    if (!version) errors.push(new ForgeError('ERR_VERSION_INVALID'))
    if (Array.isArray(jobs) === false || jobs.length < 1) {
      errors.push(new ForgeError('ERR_PIPELINE_JOB_INVALID'))
    } else {
      if (jobs.some(({ name }) => !name)) {
        errors.push(new ForgeError('ERR_PIPELINE_JOB_NAME_INVALID'))
      }
      if (jobs.some(({ description }) => !description)) {
        errors.push(new ForgeError('ERR_PIPELINE_JOB_DESC_INVALID'))
      }
    }
    return errors
  }, [])
}

validate.services = (items) => {
  return items.reduce((errors, { name, version, run, domain }) => {
    if (!name || nameRx.test(name) === false) {
      errors.push(new ForgeError('ERR_SERVICE_NAME_INVALID', name))
    }
    if (!version || versionRx.test(version) === false) {
      errors.push(new ForgeError('ERR_SERVICE_NAME_INVALID', name, version))
    }
    if (!run && typeof run !== 'string') {
      errors.push(new ForgeError('ERR_SERVICE_RUN_INVALID', name, version))
    }
    if (domain && domainRx.test(domain) === false) {
      errors.push(new ForgeError('ERR_SERVICE_DOMAIN_INVALID', domain))
    }
    return errors
  }, [])
}

validate.env = (items) => {
  const toErrors = (e) => {
    if (typeof e !== 'string') return false
    if (e.includes('=') === false) return false
    const [key, value] = e.split('=')
    if (key.trim() === '' || value.trim === '') {
      return new ForgeError('ERR_ENV_VAR_INVALID', e)
    }
  }
  return items.reduce((errors, { env = {} }) => {
    const { secrets, configs, customs } = env
    return [
      ...errors,
      ...secrets.map(toErrors).filter(Boolean),
      ...configs.map(toErrors).filter(Boolean),
      ...customs.map(toErrors).filter(Boolean)
    ]
  }, [])
}
