import * as ERRORS from './errors.js'
import * as WARNINGS from './warnings.js'

export class ForgeError extends Error {
  constructor (code, ...args) {
    const message = ERRORS[code]
    super(typeof message === 'function' ? message(...args) : message)
    this.code = code
    this.isForgeError = true
  }
}

export function warning (code, ...args) {
  const message = WARNINGS[code]
  return {
    label: 'warning',
    code,
    message: typeof message === 'function' ? message(...args) : message,
    isForgeWarning: true
  }
}
