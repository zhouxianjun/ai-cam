import type { ControlHandler } from '../utils/control/types.ts'
import { activeDevices } from '../utils/wsRegistry.ts'

export const ptzHandler: ControlHandler = {
  async execute({ clientPeer, deviceId, payload }) {
    const devicePeer = activeDevices.get(deviceId)
    if (!devicePeer) {
      clientPeer.send({ type: 'error', message: 'Device is offline' })
      return
    }
    // Route to physical device
    devicePeer.send({ type: 'command', action: 'ptz', payload })
  },
}
