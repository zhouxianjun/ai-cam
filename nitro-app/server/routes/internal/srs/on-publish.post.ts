import { defineHandler } from 'nitro'
import { getRequestIP } from 'nitro/h3'
import {
  CallbackValidationError,
  parseAndValidateBody,
  validateCallbackIP,
  verifySrsToken,
} from '../../../utils/srs.ts'

export default defineHandler(async (event) => {
  const remoteIp = getRequestIP(event) || ''
  try {
    validateCallbackIP(remoteIp)

    const body = await event.req.json()
    const { app, stream, param } = parseAndValidateBody(body)

    await verifySrsToken(param, 'publish', app, stream)
    return { code: 0 }
  } catch (err) {
    if (err instanceof CallbackValidationError) {
      return { code: err.code, error: err.error }
    }
    return { code: 400, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})
