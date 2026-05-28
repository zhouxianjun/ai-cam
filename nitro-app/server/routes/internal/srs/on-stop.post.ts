import { defineHandler } from 'nitro'
import { getRequestIP } from 'nitro/h3'
import { getDevice, saveDevice } from '../../../utils/db.ts'
import { CallbackValidationError, validateCallbackIP } from '../../../utils/srs.ts'

interface SrsStopBody {
  stream?: string
  action?: string
}

async function handleStop(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new CallbackValidationError(400, 'Invalid request body')
  }

  const { stream, action } = body as SrsStopBody
  if (!stream || !action) {
    throw new CallbackValidationError(400, 'Missing stream or action parameters')
  }

  if (action === 'on_unpublish' || action === 'on_stop') {
    const device = await getDevice(stream)
    if (device) {
      device.status = 'offline'
      device.lastSeen = Date.now()
      await saveDevice(device)
    }
  }

  return { code: 0 }
}

export default defineHandler(async (event) => {
  const remoteIp = getRequestIP(event) || ''
  try {
    validateCallbackIP(remoteIp)

    const body = await event.req.json()
    return await handleStop(body)
  } catch (err) {
    if (err instanceof CallbackValidationError) {
      return { code: err.code, error: err.error }
    }
    return { code: 400, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})
