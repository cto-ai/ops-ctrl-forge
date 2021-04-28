import fs from 'fs'
import { dirname } from 'path'
import join from 'unijoin'
import { tmpdir } from 'os'
import { test, mockalicious } from 'tapx'
import yaml from 'yaml'
import nock from 'nock'
import { ForgeError } from '../index.js'
const { mkdtemp, readdir, readFile } = fs.promises
const load = mockalicious(import.meta.url)

test('init kind not recognized', async ({ rejects }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'node',
    kind: 'unknown',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  await rejects(iter.next(), new ForgeError('ERR_KIND_NOT_RECOGNIZED', 'unknown'))
})

test('init template not found', async ({ rejects }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'not-a-template',
    kind: 'command',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  await rejects(iter.next(), new ForgeError('ERR_TEMPLATE_NOT_FOUND', 'not-a-template'))
})

test('init command/node template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'node',
    kind: 'command',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'index.js',
    'ops.yml',
    'package.json'
  ])
  const { commands: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), { encoding: 'utf-8' }))
  is(pkg.name, 'test')
  is(pkg.description, 'test desc')
})

test('init command/bash template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'bash',
    kind: 'command',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    'Dockerfile',
    'main.sh',
    'ops.yml'
  ])
  const { commands: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init command/golang template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'golang',
    kind: 'command',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'go.mod',
    'go.sum',
    'main.go',
    'ops.yml'
  ])
  const { commands: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init command/python template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'python',
    kind: 'command',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'main.py',
    'ops.yml',
    'requirements.txt'
  ])
  const { commands: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init service/node template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'node',
    kind: 'service',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'index.js',
    'ops.yml',
    'package.json'
  ])
  const { services: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), { encoding: 'utf-8' }))
  is(pkg.name, 'test')
  is(pkg.description, 'test desc')
})

test('init service/bash template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'bash',
    kind: 'service',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    'Dockerfile',
    'main.sh',
    'ops.yml'
  ])
  const { services: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init service/golang template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'golang',
    kind: 'service',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'go.mod',
    'go.sum',
    'main.go',
    'ops.yml'
  ])
  const { services: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init service/python template', async ({ is, same }) => {
  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'python',
    kind: 'service',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'main.py',
    'ops.yml',
    'requirements.txt'
  ])
  const { services: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
})

test('init remote template', async ({ is, same }) => {
  nock('https://codeload.github.com')
    .get('/owner/name/tar.gz/branch')
    .replyWithFile(200, join(dirname(import.meta.url), 'fixtures', 'tmpl.tar.gz'), {
      'Content-Type': 'application/x-gzip'
    })

  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'https://github.com/owner/name#branch',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value: status } = await iter.next()
  is(status.label, 'downloading')
  is(status.from, 'https://github.com/owner/name#branch')

  const { value } = await iter.next()
  const { label, dir } = value
  is(label, 'initialized')
  is(typeof dir, 'string')
  const files = await readdir(dir)
  same(files, [
    '.dockerignore',
    '.gitignore',
    'Dockerfile',
    'index.js',
    'ops.yml',
    'package.json'
  ])
  const { commands: [result] } = yaml.parse(await readFile(join(dir, 'ops.yml'), { encoding: 'utf-8' }))
  is(result.name, 'test:1.2.3')
  is(result.description, 'test desc')
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), { encoding: 'utf-8' }))
  is(pkg.name, 'test')
  is(pkg.description, 'test desc')
})

test('init remote template download failure', async ({ is, rejects }) => {
  nock('https://codeload.github.com')
    .get('/owner/name/tar.gz/branch')
    .reply(500)

  const createForge = await load('..')
  const forge = createForge()
  const to = await mkdtemp(join(tmpdir(), 'forge-init-test-'))
  const iter = forge.init({
    from: 'https://github.com/owner/name#branch',
    to,
    name: 'test',
    description: 'test desc',
    version: '1.2.3'
  })
  const { value: status } = await iter.next()
  is(status.label, 'downloading')
  is(status.from, 'https://github.com/owner/name#branch')

  await rejects(
    iter.next(),
    new ForgeError('ERR_TEMPLATE_DOWNLOAD_FAILED', {
      from: 'https://github.com/owner/name#branch',
      err: Error('Response code 500 (Internal Server Error)')
    })
  )
})
