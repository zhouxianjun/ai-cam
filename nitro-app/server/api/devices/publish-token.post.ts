import { defineHandler } from 'nitro'
import { HTTPError } from 'nitro/h3'
import crypto from 'node:crypto'
import { getDevice } from '../../utils/db.ts'
import { signMediaToken } from '../../utils/token.ts'

interface PublishTokenPayload {
  deviceId: string
  secret: string
  app: string
  stream: string
}

function validatePublishTokenPayload(body: unknown): PublishTokenPayload {
  if (!body || typeof body !== 'object') {
    throw new HTTPError({ status: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>
  const deviceId = payload.deviceId
  const secret = payload.secret
  const app = payload.app
  const stream = payload.stream

  if (
    typeof deviceId !== 'string' ||
    typeof secret !== 'string' ||
    typeof app !== 'string' ||
    typeof stream !== 'string' ||
    !deviceId.trim() ||
    !secret.trim() ||
    !app.trim() ||
    !stream.trim()
  ) {
    throw new HTTPError({ status: 400, message: 'Missing parameters' })
  }

  return {
    deviceId: deviceId.trim(),
    secret: secret.trim(),
    app: app.trim(),
    stream: stream.trim(),
  }
}

export default defineHandler(async (event) => {
  const body = await event.req.json()
  const { deviceId, secret, app, stream } = validatePublishTokenPayload(body)

  const device = await getDevice(deviceId)
  if (!device || device.secret !== secret) {
    throw new HTTPError({ status: 403, message: 'Device authorization failed' })
  }

  const token = signMediaToken(
    {
      sub: deviceId,
      deviceId,
      app,
      stream,
      action: 'publish',
      exp: Math.floor(Date.now() / 1000) + 60, // 60s TTL
      nonce: crypto.randomBytes(8).toString('hex'),
    },
    device.secret,
  )
  console.log('Device publish token generated: ', deviceId)
  return { token }
})
