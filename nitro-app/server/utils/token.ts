import crypto from 'node:crypto'
import type { MediaTokenClaims } from '~/shared/types.ts'

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex')

export function signJWT(payload: { userId: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 86400 }),
  ).toString('base64url')
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyJWT(token: string): { userId: string; role: string } | null {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null
    const computedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url')
    if (computedSig !== signature) return null

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function signMediaToken(claims: MediaTokenClaims, secret: string): string {
  const payloadStr = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
  return `${payloadStr}.${signature}`
}

export function verifyMediaToken(tokenString: string, secret: string): MediaTokenClaims | null {
  try {
    const [payloadStr, signature] = tokenString.split('.')
    if (!payloadStr || !signature) return null
    const computedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
    if (computedSig !== signature) return null

    const claims = JSON.parse(
      Buffer.from(payloadStr, 'base64url').toString('utf8'),
    ) as MediaTokenClaims
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}
