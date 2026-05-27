import { defineHandler } from 'nitro'
import { getRequestIP } from 'nitro/h3'
import { getDevice, saveDevice } from '../../../utils/db.ts'

interface SrsStopBody {
  stream?: string
  action?: string
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
async function handleStop(remoteIp: string, body: unknown) {
  // 1. IP Validation (restricted to local IP loopback & Docker bridge in dev)
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

  // 2. Body Schema check
  if (!body || typeof body !== 'object') {
    throw new CallbackValidationError(400, 'Invalid request body')
  }

  const { stream, action } = body as SrsStopBody
  if (!stream || !action) {
    throw new CallbackValidationError(400, 'Missing stream or action parameters')
  }

  // 3. Check action: if publish stops, sync state to offline
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
    const body = await event.req.json()
    return await handleStop(remoteIp, body)
  } catch (err) {
    if (err instanceof CallbackValidationError) {
      return { code: err.code, error: err.error }
    }
    return { code: 400, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})
