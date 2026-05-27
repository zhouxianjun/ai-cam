import { defineHandler } from 'nitro'
import { createError } from 'nitro/h3'
import crypto from 'node:crypto'
import { getDevice } from '../../utils/db.ts'
import { verifyJWT, signMediaToken } from '../../utils/token.ts'

interface PlayTokenPayload {
  deviceId: string
  app: string
  stream: string
}

function validatePlayTokenPayload(body: unknown): PlayTokenPayload {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>
  const deviceId = payload.deviceId
  const app = payload.app
  const stream = payload.stream

  if (
    typeof deviceId !== 'string' ||
    typeof app !== 'string' ||
    typeof stream !== 'string' ||
    !deviceId.trim() ||
    !app.trim() ||
    !stream.trim()
  ) {
    throw createError({ statusCode: 400, message: 'Missing parameters' })
  }

  return {
    deviceId: deviceId.trim(),
    app: app.trim(),
    stream: stream.trim(),
  }
}

export default defineHandler(async (event) => {
  const headers = event.req.headers as unknown as Record<string, unknown>
  const authHeader = headers.authorization
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const userToken = authHeader.substring(7)
  const userClaims = verifyJWT(userToken)
  if (!userClaims) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await event.req.json()
  const { deviceId, app, stream } = validatePlayTokenPayload(body)

  const device = await getDevice(deviceId)
  if (!device || device.ownerId !== userClaims.userId) {
    throw createError({ statusCode: 404, message: 'Device not found or not owned by user' })
  }

  const token = signMediaToken(
    {
      sub: userClaims.userId,
      deviceId,
      app,
      stream,
      action: 'play',
      exp: Math.floor(Date.now() / 1000) + 60, // 60s TTL
      nonce: crypto.randomBytes(8).toString('hex'),
    },
    device.secret,
  )

  return { token }
})
