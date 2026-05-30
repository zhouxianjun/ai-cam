import { defineWebSocketHandler } from 'nitro'
import type { Peer, Message } from 'crossws'
import { verifyJWT } from '../utils/token.ts'
import { getDevice, saveDevice } from '../utils/db.ts'
import { activeDevices, activeClients, deviceGraceTimers } from '../utils/wsRegistry.ts'
import { controlRegistry } from '../control/index.ts'

export interface WSContext extends Record<string, unknown> {
  type: 'client' | 'device'
  userId?: string
  deviceId?: string
  socketId?: string
}

interface WSMessagePayload {
  action?: string
  deviceId?: string
  payload?: unknown
  type?: string
}

const roleHandlers: Record<string, (url: URL) => Promise<WSContext>> = {
  client: async (url) => {
    const token = url.searchParams.get('token')
    if (!token) {
      throw new Response('Unauthorized - Missing Token', { status: 401 })
    }
    const userClaims = verifyJWT(token)
    if (!userClaims) {
      throw new Response('Unauthorized - Invalid Token', { status: 401 })
    }
    return { type: 'client', userId: userClaims.userId }
  },
  device: async (url) => {
    const deviceId = url.searchParams.get('deviceId')
    const token = url.searchParams.get('token')
    if (!deviceId || !token) {
      throw new Response('Unauthorized - Missing Params', { status: 401 })
    }
    const device = await getDevice(deviceId)
    if (!device || device.secret !== token) {
      throw new Response('Unauthorized - Auth Failed', { status: 401 })
    }
    return { type: 'device', deviceId }
  },
}

const openHandlers: Record<WSContext['type'], (peer: Peer, context: WSContext) => Promise<void>> = {
  device: async (peer, context) => {
    const deviceId = context.deviceId
    if (!deviceId) return

    // Clear offline tolerance grace period timer
    const existingTimer = deviceGraceTimers.get(deviceId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      deviceGraceTimers.delete(deviceId)
    }

    activeDevices.set(deviceId, peer)

    const device = await getDevice(deviceId)
    if (device) {
      device.status = 'online'
      device.lastSeen = Date.now()
      await saveDevice(device)
    }

    // Notify all online clients that this device is online
    for (const clientSet of activeClients.values()) {
      for (const cPeer of clientSet) {
        cPeer.send({ type: 'device_status', deviceId, status: 'online' })
      }
    }
    console.log(
      `[WS] Device ${deviceId} connected and marked online. (Socket ID: ${context.socketId})`,
    )
  },
  client: async (peer, context) => {
    const userId = context.userId
    if (!userId) return
    let clientSet = activeClients.get(userId)
    if (!clientSet) {
      clientSet = new Set()
      activeClients.set(userId, clientSet)
    }
    clientSet.add(peer)
    peer.send({ type: 'welcome', message: 'HomeGuard control panel connected' })
  },
}

const messageHandlers: Record<
  WSContext['type'],
  (peer: Peer, context: WSContext, data: WSMessagePayload) => Promise<void>
> = {
  client: async (peer, context, data) => {
    const userId = context.userId
    if (!userId) return
    const { action, deviceId, payload } = data
    if (!action || !deviceId) {
      peer.send({ type: 'error', message: 'Missing action or deviceId' })
      return
    }

    // Verify access permission
    const device = await getDevice(deviceId)
    if (!device || device.ownerId !== userId) {
      peer.send({ type: 'error', message: 'Access denied or device not found' })
      return
    }

    const handler = controlRegistry[action]
    if (handler) {
      await handler.execute({
        clientPeer: peer,
        userId,
        deviceId,
        payload,
      })
    } else {
      peer.send({ type: 'error', message: `Unknown control action: ${action}` })
    }
  },
  device: async (_peer, context, data) => {
    const deviceId = context.deviceId
    if (!deviceId) return
    const device = await getDevice(deviceId)
    if (!device) return

    // Forward status report or alarms to online clients of the device owner
    const ownerClients = activeClients.get(device.ownerId)
    if (ownerClients) {
      for (const cPeer of ownerClients) {
        cPeer.send({
          type: 'device_update',
          deviceId,
          event: data.type || 'status_report',
          payload: data.payload,
        })
      }
    }
  },
}

const closeHandlers: Record<
  WSContext['type'],
  (peer: Peer, context: WSContext, details: { code?: number; reason?: string }) => Promise<void>
> = {
  client: async (peer, context) => {
    const userId = context.userId
    if (!userId) return
    const clientSet = activeClients.get(userId)
    if (clientSet) {
      clientSet.delete(peer)
      if (clientSet.size === 0) {
        activeClients.delete(userId)
      }
    }
  },
  device: async (peer, context, details) => {
    const deviceId = context.deviceId
    if (!deviceId) return

    // Safely ignore stale WebSocket close events from previous connections
    const currentActivePeer = activeDevices.get(deviceId)
    if (currentActivePeer && currentActivePeer !== peer) {
      console.log(
        `[WS] Stale WebSocket connection for device ${deviceId} (Socket ID: ${context.socketId}) closed. Ignoring.`,
      )
      return
    }

    activeDevices.delete(deviceId)

    const handleOffline = async () => {
      const device = await getDevice(deviceId)
      if (device) {
        device.status = 'offline'
        device.lastSeen = Date.now()
        await saveDevice(device)
      }
      // Broadcast offline notice to online clients
      for (const clientSet of activeClients.values()) {
        for (const cPeer of clientSet) {
          cPeer.send({ type: 'device_status', deviceId, status: 'offline' })
        }
      }
      console.log(
        `[Grace Period] Device ${deviceId} declared offline. (Stale Socket ID: ${context.socketId})`,
      )
    }

    // 1000 normal close or client logout -> immediately mark offline
    if (details.code === 1000) {
      await handleOffline()
    } else {
      // Abnormal disconnect: set a 10s network latency/jitter grace period
      console.log(
        `[Grace Period] Active WebSocket connection for device ${deviceId} (Socket ID: ${context.socketId}) disconnected abnormally (code: ${details.code}). Starting 10s grace timer...`,
      )
      const timer = setTimeout(async () => {
        await handleOffline()
        deviceGraceTimers.delete(deviceId)
      }, 10000)
      deviceGraceTimers.set(deviceId, timer)
    }
  },
}

export const controlWebSocket = {
  async upgrade(request: Request) {
    const url = new URL(request.url)
    const role = url.searchParams.get('role')

    if (!role || !roleHandlers[role]) {
      throw new Response('Bad Request', { status: 400 })
    }

    const context = await roleHandlers[role](url)
    return { context }
  },

  async open(peer: Peer) {
    const context = peer.context as unknown as WSContext
    if (context) {
      context.socketId = Math.random().toString(36).substring(2, 9).toUpperCase()
    }
    if (context && context.type in openHandlers) {
      await openHandlers[context.type](peer, context)
    }
  },

  async message(peer: Peer, message: Message) {
    try {
      const data = message.json<WSMessagePayload>()
      const context = peer.context as unknown as WSContext
      if (context && context.type in messageHandlers) {
        await messageHandlers[context.type](peer, context, data)
      }
    } catch {
      peer.send({ type: 'error', message: 'Invalid payload format' })
    }
  },

  async close(peer: Peer, details: { code?: number; reason?: string }) {
    const context = peer.context as unknown as WSContext
    if (context && context.type in closeHandlers) {
      await closeHandlers[context.type](peer, context, details)
    }
  },
}

export default defineWebSocketHandler(controlWebSocket)
