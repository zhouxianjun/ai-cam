import { defineHandler } from 'nitro'
import { listDevicesByOwner } from '../../utils/db.ts'
import { requireAuth } from '../../utils/token.ts'

export default defineHandler(async (event) => {
  const userClaims = requireAuth(event)
  const devices = await listDevicesByOwner(userClaims.userId)
  return { devices }
})
