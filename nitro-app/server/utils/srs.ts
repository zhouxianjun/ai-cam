import { getDevice } from './db.ts'
import { verifyMediaToken } from './token.ts'

export interface SrsCallbackBody {
  app?: string
  stream?: string
  param?: string
}

export class CallbackValidationError extends Error {
  code: number
  error: string

  constructor(code: number, error: string) {
    super(error)
    this.code = code
    this.error = error
  }
}

/**
 * Validates that the request is originating from local loopback or standard dev Docker bridge subnets.
 */
export function validateCallbackIP(remoteIp: string): void {
  const isLocal =
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1' ||
    remoteIp.startsWith('172.') ||
    remoteIp.startsWith('10.') ||
    remoteIp.startsWith('192.168.') ||
    remoteIp.startsWith('::ffff:172.') ||
    remoteIp.startsWith('::ffff:10.') ||
    remoteIp.startsWith('::ffff:192.168.')
  if (!isLocal) {
    throw new CallbackValidationError(403, 'Forbidden')
  }
}

/**
 * Parses and validates the standard SRS body object, ensuring app, stream, and param exist.
 */
export function parseAndValidateBody(body: unknown): Required<SrsCallbackBody> {
  if (!body || typeof body !== 'object') {
    throw new CallbackValidationError(400, 'Invalid request body')
  }
  const { app, stream, param } = body as SrsCallbackBody
  if (!app || !stream || !param) {
    throw new CallbackValidationError(401, 'Missing media parameters')
  }
  return { app, stream, param }
}

/**
 * Extracts, decodes, and verifies the media token signature and claims for SRS publish/play actions.
 */
export async function verifySrsToken(
  param: string,
  action: 'publish' | 'play',
  app: string,
  stream: string,
) {
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

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'))
  } catch {
    throw new CallbackValidationError(400, 'Invalid token signature structure')
  }

  if (
    !claims ||
    typeof claims !== 'object' ||
    !('deviceId' in claims) ||
    typeof claims.deviceId !== 'string'
  ) {
    throw new CallbackValidationError(400, 'Malformed token claims')
  }

  const device = await getDevice(claims.deviceId)
  if (!device) {
    throw new CallbackValidationError(404, 'Device not found')
  }

  const verifiedClaims = verifyMediaToken(token, device.secret)
  if (!verifiedClaims) {
    throw new CallbackValidationError(401, 'Invalid or expired token')
  }

  if (
    verifiedClaims.action !== action ||
    verifiedClaims.app !== app ||
    verifiedClaims.stream !== stream
  ) {
    throw new CallbackValidationError(403, 'Permission mismatch')
  }

  return verifiedClaims
}
