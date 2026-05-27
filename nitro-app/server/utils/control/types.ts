import type { Peer } from 'crossws'

export interface ControlContext {
  clientPeer: Peer
  userId: string
  deviceId: string
  payload: unknown
}

export interface ControlHandler {
  execute(ctx: ControlContext): Promise<void>
}
