import { ref, type Ref, onUnmounted } from 'vue'
import { useAuthStore } from '~/app/stores/auth.ts'

export function useWhep(videoElement: Ref<HTMLVideoElement | null>) {
  const authStore = useAuthStore()
  const status = ref<'idle' | 'connecting' | 'playing' | 'error'>('idle')
  const errorMsg = ref<string | null>(null)
  const stats = ref<{ fps: number; bytesReceived: number; latency: number }>({
    fps: 0,
    bytesReceived: 0,
    latency: 0,
  })

  let pc: RTCPeerConnection | null = null
  let statsInterval: ReturnType<typeof setInterval> | null = null

  async function play(deviceId: string): Promise<void> {
    stop()
    status.value = 'connecting'
    errorMsg.value = null

    try {
      // 1. Get play token
      const tokenRes = await fetch('/api/devices/play-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ deviceId, app: 'live', stream: deviceId }),
      })

      if (!tokenRes.ok) {
        throw new Error('Failed to obtain WHEP authorization token')
      }

      const { token } = (await tokenRes.json()) as { token: string }
      const whepUrl = `https://media.local.test/rtc/v1/whep/?app=live&stream=${deviceId}&token=${token}`

      // 2. Initialize PeerConnection
      pc = new RTCPeerConnection()
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      pc.ontrack = (event) => {
        if (videoElement.value && event.streams[0]) {
          videoElement.value.srcObject = event.streams[0]
          status.value = 'playing'
          startStatsQuery()
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc?.iceConnectionState === 'failed') {
          status.value = 'error'
          errorMsg.value = 'ICE Negotiation failed'
        }
      }

      // 3. Create Offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 4. Negotiate via WHEP POST
      const sdpRes = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })

      if (!sdpRes.ok) {
        throw new Error('SDP exchange with media server failed')
      }

      const answerSdp = await sdpRes.text()
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }))
    } catch (err) {
      status.value = 'error'
      errorMsg.value = err instanceof Error ? err.message : 'Unknown playback error'
      stop()
    }
  }

  function stop(): void {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
    if (pc) {
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.close()
      pc = null
    }
    if (videoElement.value) {
      videoElement.value.srcObject = null
    }
    if (status.value !== 'error') {
      status.value = 'idle'
    }
  }

  function startStatsQuery(): void {
    let lastBytes = 0
    let lastTime = Date.now()

    if (typeof window === 'undefined') return

    statsInterval = window.setInterval(async () => {
      if (!pc) return
      try {
        const reports = await pc.getStats()
        reports.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            const rtpReport = report as RTCInboundRtpStreamStats
            const currentBytes = rtpReport.bytesReceived ?? 0
            const currentTime = Date.now()
            const durationSec = (currentTime - lastTime) / 1000

            if (durationSec > 0) {
              const _bps = (currentBytes - lastBytes) / durationSec
              stats.value.bytesReceived = currentBytes
              stats.value.fps = Math.round(rtpReport.framesPerSecond ?? 0)
              stats.value.latency = Math.round((rtpReport.jitter ?? 0) * 1000)
            }
            lastBytes = currentBytes
            lastTime = currentTime
          }
        })
      } catch {
        // Silent catch stats failure
      }
    }, 2000)
  }

  onUnmounted(() => {
    stop()
  })

  return {
    status,
    errorMsg,
    stats,
    play,
    stop,
  }
}
