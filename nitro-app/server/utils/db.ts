import { useStorage } from 'nitro/storage'
import type { User, Device } from '~/shared/types.ts'

const getStorage = () => useStorage('db')

export async function getUser(username: string): Promise<User | null> {
  const user = await getStorage().getItem<User>(`user:${username}`)
  return user || null
}

export async function saveUser(user: User): Promise<void> {
  await getStorage().setItem(`user:${user.username}`, user)
}

export async function getDevice(deviceId: string): Promise<Device | null> {
  const device = await getStorage().getItem<Device>(`device:${deviceId}`)
  return device || null
}

export async function saveDevice(device: Device): Promise<void> {
  await getStorage().setItem(`device:${device.id}`, device)
}

export async function listDevicesByOwner(ownerId: string): Promise<Device[]> {
  const storage = getStorage()
  const keys = await storage.getKeys('device:')
  const devices: Device[] = []
  for (const key of keys) {
    const device = await storage.getItem<Device>(key)
    if (device && device.ownerId === ownerId) {
      devices.push(device)
    }
  }
  return devices
}
