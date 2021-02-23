# @cto.ai/ops-ctrl-forge

> cto.ai local developer tools

## Status

WIP - do not use

## API

This is an ESM module.

## `forge(opts) => instance`

Initialize a forge instance

**Options:**

* `dockerMissingRetry` *Optional* Default: `false`. Each of the instance methods (`init`, `build`, `run`)is an async function generator. If Docker is not installed, or if it's installed but not running this will cause an instance method that relies on Docker to reject. Set this to `true` to instead yield an information object with `label`: `docker-not-found` or `docker-not-running` along with a `retries` property containing total retries. In either of these cases execution will be paused until `iter.next` is explitily called. Calling `iter.next(true)` in this scenario will trigger a retry and if succesful execution will continue. Below is an example of this advanced use case:

```js
const instance = forge({dockerMissingRetry: true})
const iter = instance.build(buildOptions)
for await (const info of iter) {
  if (info.label === 'docker-not-found' || info.label === 'docker-not-running') {
    const retry = await someUserInput()
    if (instance.retries < 10) await iter.next(retry) // triggers retry if `retry` is true
    else throw Error('unable to connect to docker')
  }
  // do more stuff with other info objects
}
```

### `instance.init()`

Currently throws `ERR_NOT_IMPLEMENTED` error.

### `instance.build(opts) => Async Iterable`

Create a build from an Op folder, tar buffer or tar stream (gzipped tars are also accepted). This function is an [async function generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of#iterating_over_async_generators) and yields info objects as the build operation progresses. These can be consumed like so:

```js
for await (const info of instance.build(buildOptions)) {
  // process info objects
}
```

**Lifecycle:**

The yielded info objects represent the phases or status information of the build operation, each 
has a `label` property describing the phase or status. The possible labels, in order, are as follows:

* `docker-not-found` - this will only occur if `dockerMissingRetry` is set to `true` in options passed to the `forge` function, see above. Contains: `{label, retries}`
* `docker-not-running` - this will only occur if `dockerMissingRetry` is set to `true` in options passed to the `forge` function, see above. Contains: `{label, retries}`
* `warning` - These may occur during the manifest normalization phase. Contains: `{label, code, message, isForgeWarning}`. The `isForgeWarning` property is always `true`. See [`warnings.js`](./lib/warnings.js) for warning codes and messages.
* `building` - Indicates that a particular selected item in the manifest is now being built. Contains `{label, name, version}`
* `docker-output` - These info objects contain the lines output by docker, there can be any number of these info objects depending on the amount of docker output. Contains `{label, output}`
* `built` - Indicates that a particular selected item in the manifest has been built. Contains `{label, type, name, version, isPublic, tag, run, publish}`. The `run` and `publish` properties contain the namespace that would be used to reference the image when running or publishing.


**Options:**

* `op` *Required* - `string`, `Buffer` or `Stream`. If a `string` it must be an absolute path to an Op folder. A Buffer must contain a tarball of an Op and a stream must be a read stream of an Op tar ball.
* `url` *Required* - `string`. The CTO.ai API URL. Example: `https://www.stg-platform.hc.ai/api/v1`
* `registry` *Required* - `string`. The Docker hub host. Example: `registry.cto.ai`
* `select` *Required* - `array`. The names of commands, workflows, pipelines or services to build from an op manifest file. Must have at least one matching name.
* `tokens` *Required* - `object`. A tokens object, see [ops-account-ctrl](https://github.com/cto-ai/ops-account-ctrl)
* `team` *Required* - `string`. The team that the Op belongs to, this will be used as part of the image build tag name.
* `cache` *Optional* Default: `true` - `boolean`. Set to `false` to set the `--no-cache` flag for the Docekr image build.


### `instance.run()`

Currently throws `ERR_NOT_IMPLEMENTED` error.

## Error Handling

Instance methods are async generator functions. Any errors therefore cause a rejection to occur, which when used in an async context (async function or ESM TLA) can be wrapped in a try catch and then handled and/or propagated. The usage pattern is as follows (using `instance.build` as an example but the same applies to all methods):

```js

try { 
  for await (const info of instance.build(buildOptions)) {
    // process info objects
  }
} catch (err) {
  // rethrow non-forge errors
  if (!err.isForgeError) throw err
  // use err.code to decide what to do with the error
}
```

See [`errors.js`](lib/errors.js) for an error code reference.

## Engines

* Node 12.4+
* Node 14.0+

## Development

Test:

```sh
npm test
```

Visual coverage report (run after test):

```sh
npm run cov
```

Lint:

```sh
npm run lint
```

Autoformat:

```sh
npm run lint -- --fix
```

## Releasing

For mainline releases:

```sh
npm version <major|minor|patch>
git push --follow-tags
```

For prereleases:

```sh
npm version prerelease
git push --follow-tags
```

### License

MIT
