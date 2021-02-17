import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { join } from 'desm'
import got from 'got'
import { MANIFEST_NAME } from '@cto.ai/ops-constants'
import { parse, normalize } from './manifest'
import render from './render.js'
import { kJobPath } from './jobs.js'
const { mkdtemp } = fs.promises
const template = join(import.meta.url, '..', 'templates', 'job', 'bash')

const install = (packages) => {
  if (packages.length === 0) return ''
  return `apt-get update && apt-get -y install ${packages.join(' ')} && rm -r /var/cache/apt/archives/`
}

export const tmp = tmpdir()

export default async function createJobs (url, tokens, pipelines) {
  if (pipelines.length === 0) return []
  const { body: token } = await got(`${url}'/private/registry/token/pipeline'`, {
    headers: {
      Accept: 'application/json',
      Authorization: tokens.accessToken
    }
  })
  const manifests = []
  for (const { jobs, version } of pipelines) {
    for (const { name, description, packages, steps } of jobs) {
      const dest = await mkdtemp(path.join(tmp, `ops-ctrl-forge-${name}`))
      await render(template, dest, {
        token,
        version,
        description,
        deps: install(packages),
        steps: steps.join('\n'),
        [kJobPath]: dest
      })
      manifests.push(normalize(await parse(join(dest, MANIFEST_NAME))))
    }
  }
  return manifests
}
