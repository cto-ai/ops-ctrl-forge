import fs, { createReadStream } from 'fs'
import path from 'path'
import { createServer } from 'http'
import { once } from 'events'
import { PassThrough } from 'stream'
import { test, mockalicious } from 'tapx'
import { when } from 'nonsynchronous'
import { happyMocks, mockOp } from './helper.js'
import yaml from 'yaml'
import createForge, { ERRORS, WARNINGS } from '../index.js'
const { readFile } = fs.promises
const load = mockalicious(import.meta.url)

test('build - op option required', async ({ rejects }) => {
  const forge = createForge()
  const opts = {}
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_OP_OPTION_REQUIRED))
})

test('build - api option required', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: 'test' }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_API_OPTION_REQUIRED))
})

test('build - registry option required', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: 'test', api: 'http://test.tst' }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_REGISTRY_OPTION_REQUIRED))
})

test('build - op option as string must be absolute path', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: 'test', api: 'http://test.tst', registry: 'test.test.test' }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_OP_OPTION_PATH_MUST_BE_ABSOLUTE('test')))
})

test('build - op option must be string buffer or stream', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: { a: 1 }, api: 'http://test.tst', registry: 'test.test.test' }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_OP_OPTION_INVALID))
})

test('build - select option required', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: '/test', api: 'http://test.tst', registry: 'test.test.test' }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_SELECT_OPTION_INVALID))
})

test('build - select option must be an array', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: '/test', api: 'http://test.tst', registry: 'test.test.test', select: {} }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_SELECT_OPTION_INVALID))
})

test('build - select array must have at least one item', async ({ rejects }) => {
  const forge = createForge()
  const opts = { op: '/test', api: 'http://test.tst', registry: 'test.test.test', select: [] }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_SELECT_OPTION_INVALID))
})

test('build - select array must match at least one name in the manifest', async ({ rejects }) => {
  const createForge = await load('..', happyMocks())
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: 'http://localhost:9999',
    registry: 'registry.test.test',
    select: ['not-test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_SELECT_OPTION_INVALID))
})

test('build - expired tokens', async ({ rejects }) => {
  const createForge = await load('..', happyMocks({
    validate () { return false }
  }))
  const forge = createForge()
  const opts = {
    op: await mockOp('version: "1"'),
    api: 'http://localhost:9999',
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_TOKENS_EXPIRED))
})

test('build - invalid tokens', async ({ rejects }) => {
  const createForge = await load('..', happyMocks({
    validate () { throw Error('Access token is missing') }
  }))
  const forge = createForge()
  const opts = {
    op: await mockOp('version: "1"'),
    api: 'http://localhost:9999',
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_TOKENS_INVALID('Access token is missing')))
})

test('build command', async ({ is, same, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, opts.op)
  const { done } = await iter.next()
  is(done, true)
})

test('build service', async ({ is, same, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      services:
        - name: test:0.1.0
          public: false
          description: test desc
          domain: example.com
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'service')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, opts.op)
  const { done } = await iter.next()
  is(done, true)
})

test('build pipeline', async ({ is, match, teardown }) => {
  let buildImageArgs = null
  let until = when()
  let dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      pipelines:
        - name: test:0.1.0
          description: test desc
          jobs:
            - name: step-1
              description: first pipeline job
              sdk: "2"
              packages:
                - git
              steps:
                - git clone https://github.com/cto-ai/sdk-python /tmp/state/sdk-python
            - name: step-2
              description: second pipeline job
              sdk: "2"
              packages:
                - python3
                - python3-pip
              steps:
                - echo "pip3 is ready to use!"
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const init = iter.next()
  const [req, res] = await once(api, 'request')
  is(req.url, '/private/registry/token/pipeline')
  res.end('test-token')
  const { value: step1Info } = await init
  is(step1Info.label, 'building')
  is(step1Info.name, 'step-1')
  is(step1Info.version, '0.1.0')
  {
    const next = iter.next()
    await until()
    until = when()
    const [{ context, src }, { nocache, t, pull }] = buildImageArgs
    is(context, opts.op)
    is(src, undefined)
    is(nocache, false)
    is(t, 'registry.test.test/testteam/step-1:0.1.0')
    is(pull, true)
    dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
    const { value: dockerOutput } = await next
    is(dockerOutput.label, 'docker-output')
    is(dockerOutput.output, 'test output')
    dockerBuildStream.push(null) // eos
    const { value: built } = await iter.next()
    const { label, type, name, version, isPublic, tag, run, publish } = built
    is(label, 'built')
    is(type, 'job')
    is(name, 'step-1')
    is(version, '0.1.0')
    is(isPublic, false)
    is(tag, 'registry.test.test/testteam/step-1:0.1.0')
    match(run, /step-1@/)
    is(publish, opts.op)
    const jobManifest = yaml.parse(await readFile(path.join(run, 'ops.yml'), 'utf-8'))
    is(jobManifest.commands[0].name, 'step-1:0.1.0')
    is(jobManifest.commands[0].description, 'first pipeline job')
  }
  const { value: step2Info } = await iter.next()
  is(step2Info.label, 'building')
  is(step2Info.name, 'step-2')
  is(step2Info.version, '0.1.0')
  {
    dockerBuildStream = new PassThrough()
    const next = iter.next()
    await until()
    const [{ context, src }, { nocache, t, pull }] = buildImageArgs
    is(context, opts.op)
    is(src, undefined)
    is(nocache, false)
    is(t, 'registry.test.test/testteam/step-2:0.1.0')
    is(pull, true)
    dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
    const { value: dockerOutput } = await next
    is(dockerOutput.label, 'docker-output')
    is(dockerOutput.output, 'test output')
    dockerBuildStream.push(null) // eos
    const { value: built } = await iter.next()
    const { label, type, name, version, isPublic, tag, run, publish } = built
    is(label, 'built')
    is(type, 'job')
    is(name, 'step-2')
    is(version, '0.1.0')
    is(isPublic, false)
    is(tag, 'registry.test.test/testteam/step-2:0.1.0')
    match(run, /step-2@/)
    is(publish, opts.op)
    const jobManifest = yaml.parse(await readFile(path.join(run, 'ops.yml'), 'utf-8'))
    is(jobManifest.commands[0].name, 'step-2:0.1.0')
    is(jobManifest.commands[0].description, 'second pipeline job')
  }
  const { done } = await iter.next()
  is(done, true)
})

test('build from tar buffer', async ({ is, same, match, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await readFile(await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `, { archive: true })),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }

  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  match(context, /ops-ctrl-forge-unpacked-tar/)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, context)
  const { done } = await iter.next()
  is(done, true)
})

test('build from tar stream', async ({ is, same, match, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: createReadStream(await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `, { archive: true })),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }

  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  match(context, /ops-ctrl-forge-unpacked-tar/)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, context)
  const { done } = await iter.next()
  is(done, true)
})

test('build from compressed tar buffer', async ({ is, same, match, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await readFile(await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `, { archive: true, compress: true })),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }

  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  match(context, /ops-ctrl-forge-unpacked-tar/)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, context)
  const { done } = await iter.next()
  is(done, true)
})

test('build from compressed tar stream', async ({ is, same, match, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: createReadStream(await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `, { archive: true, compress: true })),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }

  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  match(context, /ops-ctrl-forge-unpacked-tar/)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, context)
  const { done } = await iter.next()
  is(done, true)
})

test('build - public', async ({ is, same, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: true
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/public.testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, true)
  is(tag, 'registry.test.test/public.testteam/test:0.1.0')
  is(run, 'test')
  is(publish, opts.op)
  const { done } = await iter.next()
  is(done, true)
})

test('build - docker build error', async ({ is, rejects, teardown }) => {
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      throw Error('test')
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  await rejects(iter.next(), Error(ERRORS.ERR_DOCKER_BUILD_FAILURE(Error('test'))))
})

test('build - docker build failure', async ({ is, same, teardown, rejects }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ error: 'test error', errorDetail: { message: 'test error', code: '1234' } }) + '\n'))
  await rejects(next, Error(ERRORS.ERR_DOCKER_BUILD_FAILURE({ code: '1234', message: 'test error' })))
})

test('build - docker build corrupt output', async ({ is, same, teardown, rejects }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  const createForge = await load('..', happyMocks({
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge()
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from('not a json string :(\n'))
  await rejects(next, Error(ERRORS.ERR_DOCKER_OUTPUT_CORRUPT({ message: 'Unexpected token o in JSON at position 1' })))
})

test('build - docker not found (dockerMissingRetry: false)', async ({ rejects }) => {
  const createForge = await load('..', happyMocks({
    async stat () { throw Error('test') }
  }))
  const forge = createForge()
  const opts = {
    op: await mockOp(`
    version: "1"
    commands:
      - name: test
        version: 0.1.0
        public: false
        description: test desc
        run: node /ops/index.js
        src:
          - Dockerfile
          - index.js
          - package.json
          - .dockerignore
        remote: true
        sdk: "2"
        sourceCodeURL: ""
        mountCwd: false
        mountHome: false
  `),
    api: 'http://localhost:9999',
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_DOCKER_NOT_FOUND))
})

test('build - docker not running (dockerMissingRetry: false)', async ({ rejects }) => {
  const createForge = await load('..', happyMocks({
    async ping () { throw Error('test') }
  }))
  const forge = createForge()
  const opts = {
    op: await mockOp(`
    version: "1"
    commands:
      - name: test
        version: 0.1.0
        public: false
        description: test desc
        run: node /ops/index.js
        src:
          - Dockerfile
          - index.js
          - package.json
          - .dockerignore
        remote: true
        sdk: "2"
        sourceCodeURL: ""
        mountCwd: false
        mountHome: false
  `),
    api: 'http://localhost:9999',
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  await rejects(iter.next(), Error(ERRORS.ERR_DOCKER_NOT_RUNNING))
})

test('build - docker not found (dockerMissingRetry: true) with failure', async ({ is, same, rejects, teardown }) => {
  const createForge = await load('..', happyMocks({
    async stat () { throw Error('test') }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge({ dockerMissingRetry: true })
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  {
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_FOUND')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_FOUND)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 0)
  }
  {
    await iter.next({ retry: true })
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_FOUND')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_FOUND)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 1)
  }
  await iter.next(false) // stop retrying
  await rejects(iter.next(), Error(ERRORS.ERR_DOCKER_NOT_FOUND))
})

test('build - docker not found (dockerMissingRetry: true) with recovery', async ({ is, same, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  let statFail = true
  const createForge = await load('..', happyMocks({
    async stat () {
      if (statFail) throw Error('test')
    },
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge({ dockerMissingRetry: true })
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  {
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_FOUND')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_FOUND)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 0)
  }
  {
    await iter.next({ retry: true })
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_FOUND')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_FOUND)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 1)
  }
  statFail = false // let docker be "found"
  await iter.next({ retry: true }) // retry again
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, opts.op)
  const { done } = await iter.next()
  is(done, true)
})

test('build - docker not running (dockerMissingRetry: true) with failure', async ({ is, same, rejects, teardown }) => {
  const createForge = await load('..', happyMocks({
    async ping () { throw Error('test') }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge({ dockerMissingRetry: true })
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  {
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_RUNNING')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_RUNNING)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 0)
  }
  {
    await iter.next({ retry: true })
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_RUNNING')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_RUNNING)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 1)
  }
  await iter.next(false) // stop retrying
  await rejects(iter.next(), Error(ERRORS.ERR_DOCKER_NOT_RUNNING))
})

test('build - docker not running (dockerMissingRetry: true) with recovery', async ({ is, same, teardown }) => {
  let buildImageArgs = null
  const until = when()
  const dockerBuildStream = new PassThrough()
  let pingFail = true
  const createForge = await load('..', happyMocks({
    async ping () {
      if (pingFail) throw Error('test')
    },
    async buildImage (...args) {
      buildImageArgs = args
      until.done()
      return dockerBuildStream
    }
  }))
  const api = createServer().listen()
  teardown(() => api.close())
  await once(api, 'listening')
  const forge = createForge({ dockerMissingRetry: true })
  const opts = {
    op: await mockOp(`
      version: "1"
      commands:
        - name: test
          version: 0.1.0
          public: false
          description: test desc
          run: node /ops/index.js
          src:
            - Dockerfile
            - index.js
            - package.json
            - .dockerignore
          remote: true
          sdk: "2"
          sourceCodeURL: ""
          mountCwd: false
          mountHome: false
    `),
    api: `http://localhost:${api.address().port}`,
    registry: 'registry.test.test',
    select: ['test'],
    tokens: {},
    team: 'testteam',
    cache: true
  }
  const iter = forge.build(opts)
  {
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_RUNNING')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_RUNNING)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 0)
  }
  {
    await iter.next({ retry: true }) // retry
    const { value: warning } = await iter.next()
    is(warning.label, 'warning')
    is(warning.code, 'WRN_DOCKER_NOT_RUNNING')
    is(warning.message, WARNINGS.WRN_DOCKER_NOT_RUNNING)
    is(warning.isForgeWarning, true)
    is(warning.isDockerProblem, true)
    is(warning.retries, 1)
  }
  pingFail = false // let docker "run"
  await iter.next({ retry: true }) // retry again
  const { value: buildingInfo } = await iter.next()
  is(buildingInfo.label, 'building')
  is(buildingInfo.name, 'test')
  is(buildingInfo.version, '0.1.0')
  const next = iter.next()
  await until()
  const [{ context, src }, { nocache, t, pull }] = buildImageArgs
  is(context, opts.op)
  same(src, ['Dockerfile', 'index.js', 'package.json', '.dockerignore'])
  is(nocache, false)
  is(t, 'registry.test.test/testteam/test:0.1.0')
  is(pull, true)
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' }) + '\n'))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'command')
  is(name, 'test')
  is(version, '0.1.0')
  is(isPublic, false)
  is(tag, 'registry.test.test/testteam/test:0.1.0')
  is(run, 'test')
  is(publish, opts.op)
  const { done } = await iter.next()
  is(done, true)
})
