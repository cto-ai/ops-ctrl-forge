import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { join } from 'desm'
import got from 'got'
import { MANIFEST_NAME } from '@cto.ai/ops-constants'
import { parse, normalize } from './manifest.js'
import render from './render.js'
import { kJobPath } from './symbols.js'
const { mkdtemp } = fs.promises
const template = join(import.meta.url, '..', 'templates', 'job', 'bash')

const install = (packages = []) => {
  if (packages.length === 0) return ''
  return `apt-get update && apt-get -y install ${packages.join(' ')} && rm -r /var/cache/apt/archives/`
}

const tmp = tmpdir()

export default async function createJobs (api, tokens, pipelines) {
  if (pipelines.length === 0) return []
  const { body: token } = await got(`${api}/private/registry/token/pipeline`, {
    headers: {
      Accept: 'application/json',
      Authorization: tokens.accessToken
    }
  })

  const result = []
  for (const { jobs, version } of pipelines) {
    for (const { name, description, packages, steps } of jobs) {
      const dest = await mkdtemp(path.join(tmp, `${name}@`))
      await render(template, dest, {
        name: `${name}:${version}`,
        token,
        description,
        deps: install(packages),
        steps: steps.join('\n'),
        [kJobPath]: dest
      })
      const { commands } = normalize(await parse(path.join(dest, MANIFEST_NAME)))
      result.push(...commands.map((cmd) => ({ ...cmd, type: 'job', jobDir: dest })))
    }
  }
  return result
}
