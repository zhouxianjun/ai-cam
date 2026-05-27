import { defineHandler } from 'nitro'
import { createError } from 'nitro/h3'
import { listDevicesByOwner } from '../../utils/db.ts'
import { verifyJWT } from '../../utils/token.ts'

export default defineHandler(async (event) => {
  const headers = event.req.headers as unknown as Record<string, unknown>
  const authHeader = headers.authorization

  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const token = authHeader.substring(7)
  const userClaims = verifyJWT(token)
  if (!userClaims) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const devices = await listDevicesByOwner(userClaims.userId)
  return { devices }
})
