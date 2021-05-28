export const WRN_OPS_FIELD_DEPRECATED = 'The manifest `ops` field is deprecated, use the `commands` field'
export const WRN_VERSION_FIELD_MISSING = (type, name, version) => `A ${type} (${name}) is missing a version field, defaulting to ${version}`
export const WRN_DOCKER_NOT_FOUND = 'Docker not found'
export const WRN_DOCKER_NOT_RUNNING = 'Docker not running'
export const WRN_OP_MOUNTS_DIRECTORIES = 'Warning, the op you are about to run mounts some directories!'
export const WRN_OP_MOUNTS_CWD = 'The current working directory will be mounted.'
export const WRN_OP_MOUNTS_HOME = 'The home directory will be mounted.'
export const WRN_OP_MOUNTS = (bind) => ` The following directories will be mounted: ${bind.map((d) => d.split(':')[0]).join('\n   ')}`
