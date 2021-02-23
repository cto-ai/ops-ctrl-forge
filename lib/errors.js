export const ERR_NOT_IMPLEMENTED = 'This method is not currently implemented'
export const ERR_API_OPTION_REQUIRED = 'The `api` option is required'
export const ERR_REGISTRY_OPTION_REQUIRED = 'The `registry` option is required'
export const ERR_TOKENS_EXPIRED = 'tokens expired'
export const ERR_OP_OPTION_REQUIRED = 'The `op` option is required'
export const ERR_OP_OPTION_INVALID = 'The `op` option is invalid. It may be an absolute path string, or a tarball Buffer or stream'
export const ERR_SELECT_OPTION_INVALID = 'Select array option is required and must contain at least one op name in the manifest'
export const ERR_OP_OPTION_PATH_MUST_BE_ABSOLUTE = (path) => `The \`op\` option must be an absolute path when a string, got "${path}"`
export const ERR_OP_NAME_INVALID = 'Op name must be a non-empty string'
export const ERR_OP_DESC_INVALID = 'Op description must be a non-empty string'
export const ERR_VERSION_INVALID = 'Each op must have a valid version string'
export const ERR_NO_PUBLIC = 'Build manifest is missing the public field, add `public:false` to publish op as private'
export const ERR_NO_RUN = 'The run command must be included as a string'
export const ERR_PIPELINE_JOB_INVALID = 'Each pipeline requires at least one valid job'
export const ERR_PIPELINE_JOB_NAME_INVALID = 'Each pipeline job name should be a non-empty string'
export const ERR_PIPELINE_JOB_DESC_INVALID = 'Each pipeline job description should be a non-empty string'
export const ERR_ENV_VAR_INVALID = (e) => `Env variable ${e} is missing a key or value between it's =`
export const ERR_SERVICE_RUN_INVALID = (name) => `The run command must be included as a string for service ${name}`
export const ERR_SERVICE_DOMAIN_INVALID = (domain) => `The domain field (${domain}) doesn’t match expected format, please provide just the domain without the scheme protocol`
export const ERR_SERVICE_NAME_INVALID = (name, version) => {
  return !version
    ? `Service name (${name}) must contain a version (name:version)`
    : (name ? 'Service name is not valid' : 'Service must have a name')
}
export const ERR_DOCKER_BUILD_FAILURE = ({ code, message }) => `Docker build image error: ${message}${code ? ` (Docker code: ${code})` : ''}`
export const ERR_DOCKER_OUTPUT_CORRUPT = ({ message }) => `Docker build image error, output cannot be parsed: ${message}`
export const ERR_DOCKER_NOT_FOUND = 'Docker not found'
export const ERR_DOCKER_NOT_RUNNING = 'Docker not running'
