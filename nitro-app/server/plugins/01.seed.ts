import { definePlugin } from 'nitro'
import { saveUser, getUser } from '../utils/db.ts'
import crypto from 'node:crypto'

export default definePlugin(async () => {
  const existingAdmin = await getUser('admin')
  if (!existingAdmin) {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex')
    await saveUser({
      id: 'admin_user',
      username: 'admin',
      passwordHash,
      salt,
      role: 'admin',
      createdAt: Date.now(),
    })
    console.log('[Seed] Default admin user created (admin / admin123)')
  }
})
