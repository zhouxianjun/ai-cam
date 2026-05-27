import type { Peer } from 'crossws'

export const activeDevices = new Map<string, Peer>()
export const activeClients = new Map<string, Set<Peer>>()
export const deviceGraceTimers = new Map<string, NodeJS.Timeout>()
