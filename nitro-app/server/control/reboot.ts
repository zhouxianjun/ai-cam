import type { ControlHandler } from '../utils/control/types.ts'
import { activeDevices } from '../utils/wsRegistry.ts'

export const rebootHandler: ControlHandler = {
  async execute({ clientPeer, deviceId }) {
    const devicePeer = activeDevices.get(deviceId)
    if (!devicePeer) {
      clientPeer.send({ type: 'error', message: 'Device is offline' })
      return
    }
    devicePeer.send({ type: 'command', action: 'reboot' })
  },
}
