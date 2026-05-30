import { defineHandler } from 'nitro'
import { HTTPError } from 'nitro/h3'
import crypto from 'node:crypto'
import { getDevice } from '../../utils/db.ts'
import { signMediaToken, requireAuth } from '../../utils/token.ts'

interface PlayTokenPayload {
  deviceId: string
  app: string
  stream: string
}

function validatePlayTokenPayload(body: unknown): PlayTokenPayload {
  if (!body || typeof body !== 'object') {
    throw new HTTPError({ status: 400, message: 'Invalid request body' })
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
    throw new HTTPError({ status: 400, message: 'Missing parameters' })
  }

  return {
    deviceId: deviceId.trim(),
    app: app.trim(),
    stream: stream.trim(),
  }
}

export default defineHandler(async (event) => {
  const userClaims = requireAuth(event)

  const body = await event.req.json()
  const { deviceId, app, stream } = validatePlayTokenPayload(body)

  const device = await getDevice(deviceId)
  if (!device || device.ownerId !== userClaims.userId) {
    throw new HTTPError({ status: 404, message: 'Device not found or not owned by user' })
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
