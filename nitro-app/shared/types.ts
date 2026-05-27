export interface User {
  id: string
  username: string
  passwordHash: string
  salt: string
  role: 'admin' | 'user'
  createdAt: number
}

export interface Device {
  id: string
  name: string
  secret: string
  status: 'online' | 'offline'
  lastSeen: number
  ownerId: string
  createdAt: number
}

export interface MediaTokenClaims {
  sub: string
  deviceId: string
  app: string
  stream: string
  action: 'play' | 'publish'
  exp: number
  nonce: string
}

export interface ControlWSMessage {
  action: string
  deviceId: string
  payload: unknown
}
