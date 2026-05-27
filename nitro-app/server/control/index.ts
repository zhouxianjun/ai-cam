import type { ControlHandler } from '../utils/control/types.ts'
import { ptzHandler } from './ptz.ts'
import { rebootHandler } from './reboot.ts'
import { statusHandler } from './status.ts'

export const controlRegistry: Record<string, ControlHandler> = {
  ptz: ptzHandler,
  reboot: rebootHandler,
  status_query: statusHandler,
}
