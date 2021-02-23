import fs, { createReadStream } from 'fs'
import path from 'path'
import { createServer } from 'http'
import { once } from 'events'
import { PassThrough } from 'stream'
import { test, mockalicious } from 'tapx'
import { when } from 'nonsynchronous'
import { happyMocks, mockOp } from './helper.js'
import yaml from 'yaml'
const { readFile } = fs.promises
const load = mockalicious(import.meta.url)

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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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

test('build workflow', async ({ is, same, teardown }) => {
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
      workflows:
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
          steps:
            - echo test
            - exit 0
    `),
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
  const { value: dockerOutput } = await next
  is(dockerOutput.label, 'docker-output')
  is(dockerOutput.output, 'test output')
  dockerBuildStream.push(null) // eos
  const { value: built } = await iter.next()
  const { label, type, name, version, isPublic, tag, run, publish } = built
  is(label, 'built')
  is(type, 'workflow')
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
    url: `http://localhost:${api.address().port}`,
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
    dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
    url: `http://localhost:${api.address().port}`,
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
  dockerBuildStream.push(Buffer.from(JSON.stringify({ stream: 'test output' })))
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
