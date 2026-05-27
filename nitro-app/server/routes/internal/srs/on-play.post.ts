import { defineHandler } from 'nitro'
import { getRequestIP } from 'nitro/h3'
import { getDevice } from '../../../utils/db.ts'
import { verifyMediaToken } from '../../../utils/token.ts'

interface SrsCallbackBody {
  app?: string
  stream?: string
  param?: string
}

class CallbackValidationError extends Error {
  code: number
  error: string

  constructor(code: number, error: string) {
    super(error)
    this.code = code
    this.error = error
  }
}

// Early validator block to avoid flat conditional chains
async function validatePlay(remoteIp: string, body: unknown) {
  // 1. IP Validation (restricted to local IP loopback)
  const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1'
  if (!isLocal) {
    throw new CallbackValidationError(403, 'Forbidden')
  }

  // 2. Body Schema check
  if (!body || typeof body !== 'object') {
    throw new CallbackValidationError(400, 'Invalid request body')
  }
  const { app, stream, param } = body as SrsCallbackBody
  if (!app || !stream || !param) {
    throw new CallbackValidationError(401, 'Missing parameters')
  }

  // 3. Token Check from param
  const searchParams = new URLSearchParams(param.startsWith('?') ? param : `?${param}`)
  const token = searchParams.get('token')
  if (!token) {
    throw new CallbackValidationError(401, 'Missing token')
  }

  const parts = token.split('.')
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new CallbackValidationError(400, 'Malformed token')
  }
  const payloadBase64 = parts[0]

  let claims
  try {
    claims = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'))
  } catch {
    throw new CallbackValidationError(400, 'Invalid token structure')
  }

  if (!claims || typeof claims.deviceId !== 'string') {
    throw new CallbackValidationError(400, 'Malformed token claims')
  }

  // 4. Device Lookup
  const device = await getDevice(claims.deviceId)
  if (!device) {
    throw new CallbackValidationError(404, 'Device not found')
  }

  // 5. Verification of token signature & expiration
  const verifiedClaims = verifyMediaToken(token, device.secret)
  if (!verifiedClaims) {
    throw new CallbackValidationError(401, 'Invalid or expired token')
  }

  // 6. Action/Scope Permission Check
  if (
    verifiedClaims.action !== 'play' ||
    verifiedClaims.app !== app ||
    verifiedClaims.stream !== stream
  ) {
    throw new CallbackValidationError(403, 'Permission mismatch')
  }

  return { code: 0 }
}

export default defineHandler(async (event) => {
  const remoteIp = getRequestIP(event) || ''
  try {
    const body = await event.req.json()
    return await validatePlay(remoteIp, body)
  } catch (err) {
    if (err instanceof CallbackValidationError) {
      return { code: err.code, error: err.error }
    }
    return { code: 400, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})
