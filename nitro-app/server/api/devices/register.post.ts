import { defineHandler } from 'nitro'
import { HTTPError } from 'nitro/h3'
import { getDevice, saveDevice } from '../../utils/db.ts'
import type { Device } from '~/shared/types.ts'

interface RegisterPayload {
  deviceId: string
  name?: string
  secret: string
}

function validateRegisterPayload(body: unknown): RegisterPayload {
  if (!body || typeof body !== 'object') {
    throw new HTTPError({ status: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>
  const deviceId = payload.deviceId
  const secret = payload.secret
  const name = payload.name

  if (
    typeof deviceId !== 'string' ||
    typeof secret !== 'string' ||
    !deviceId.trim() ||
    !secret.trim()
  ) {
    throw new HTTPError({ status: 400, message: 'DeviceId and secret are required' })
  }

  return {
    deviceId: deviceId.trim(),
    secret: secret.trim(),
    name: typeof name === 'string' ? name.trim() : undefined,
  }
}

export default defineHandler(async (event) => {
  const body = await event.req.json()
  const { deviceId, name, secret } = validateRegisterPayload(body)

  const existingDevice = await getDevice(deviceId)
  let device: Device

  if (existingDevice) {
    if (existingDevice.secret !== secret) {
      throw new HTTPError({ status: 403, message: 'Invalid device secret' })
    }
    device = {
      ...existingDevice,
      status: 'online',
      lastSeen: Date.now(),
    }
  } else {
    device = {
      id: deviceId,
      name: name || deviceId,
      secret,
      status: 'online',
      lastSeen: Date.now(),
      ownerId: 'admin_user',
      createdAt: Date.now(),
    }
  }

  await saveDevice(device)
  console.log('Device registered successfully: ', deviceId)
  return { success: true }
})
