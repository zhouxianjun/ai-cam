import { defineHandler } from 'nitro'
import { createError } from 'nitro/h3'
import crypto from 'node:crypto'
import { getUser } from '../../utils/db.ts'
import { signJWT } from '../../utils/token.ts'

interface LoginPayload {
  username: string
  password: string
}

function validateLoginPayload(body: unknown): LoginPayload {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>
  const username = payload.username
  const password = payload.password

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password.trim()
  ) {
    throw createError({ statusCode: 400, message: 'Username and password are required' })
  }

  return { username: username.trim(), password }
}

export default defineHandler(async (event) => {
  const body = await event.req.json()
  const { username, password } = validateLoginPayload(body)

  const user = await getUser(username)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' })
  }

  const inputHash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex')
  if (inputHash !== user.passwordHash) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' })
  }

  const token = signJWT({ userId: user.id, role: user.role })
  return { token }
})
