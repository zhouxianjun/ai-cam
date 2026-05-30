# HomeGuard-RTC Phase 4 Integration: Troubleshooting & Obscure Issues Reference

This document compiles the technical investigations, root causes, and production-grade solutions for all the hidden, complex, and obscure networking and compiler bugs encountered during the Phase 4 ESP32 integration.

---

## 1. Embedded Local TLS Verification (Production-Grade `mkcert` CA)
* **Problem**: In newer ESP-IDF versions, bypassing server identity validation (`.skip_cert_common_name_check = true`) is unstable when standard CA bundles are attached, leading to SSL handshake failures. However, using the default ESP-IDF CA bundle fails to authenticate `app.local.test` and `media.local.test` because our local domains are signed by a custom local `mkcert` CA.
* **Root Cause**: Bypassing common name checks causes standard TLS client handshakes to behave unpredictably in modern MbedTLS setups, while the default bundle doesn't trust the custom `mkcert` Root CA.
* **Solution**: Embedded the local `mkcert` root CA certificate (`rootCA.pem`) directly into the firmware as a static header (`root_ca.h`). Configured `.cert_pem = ROOT_CA_PEM` and disabled `.crt_bundle_attach = NULL` on the connection clients:
  - In `control_ws.c` (WebSocket Client)
  - In `whip_negotiator.c` (HTTPS Clients)
  This establishes standard, production-grade TLS validation by verifying signatures against the actual custom root CA that issued the local certificates.

---

## 2. GCC 15.2.0 Internal Compiler Segfault
* **Problem**: While compiling ESP-IDF's core `esp_lcd` component (`esp_lcd_panel_rgb.c`), the Xtensa cross-compiler (GCC 15.2.0) crashed with an internal segmentation fault.
* **Root Cause**: The compiler crashed during the Register Allocation pass (`ira`) when optimized under Debug level (`-Og` / `CONFIG_COMPILER_OPTIMIZATION_DEBUG`) due to a bug in GCC's code generator.
* **Solution**: Changed the optimization profile in `sdkconfig` and `sdkconfig.defaults` to **Size Optimization (`-Os` / `CONFIG_COMPILER_OPTIMIZATION_SIZE`)**. Bypassing Debug optimization altered register allocation logic, bypassing the GCC segfault.

---

## 3. TLS SNI & Nginx Stream Routing Failure
* **Problem**: When both the WebSocket client and HTTPS token client initialized, they received a standard `200 OK` but with incorrect/empty payloads, resulting in `Sec-WebSocket-Accept not found` and `Empty token response received`.
* **Root Cause**: Nginx uses an L4 stream router that prereads the SNI extension (`ssl_preread on`) to route incoming connections on port `443` to the appropriate backend targets (`app.local.test` vs `media.local.test`). When `.skip_cert_common_name_check = true` is set, ESP-IDF's `esp_tls` bypasses the call to `mbedtls_ssl_set_hostname`, meaning **no SNI extension is sent in the TLS Client Hello**. This caused Nginx to fall back to the `default` target (the SRS media server), which responded to WebSocket/token requests with invalid endpoints.
* **Solution**: Set `.skip_cert_common_name_check = false` in both `control_ws.c` and `whip_negotiator.c`. Since the actual `mkcert` Root CA is trusted via `root_ca.h`, the SSL handshake succeeds, SNI is transmitted, and Nginx routes signaling/token traffic to the Nitro server.

---

## 4. Vite Dev Server Allowed Hosts Webhook Block
* **Problem**: During WHIP Offer SDP negotiation, `esp_http_client_perform` failed with `ESP_ERR_HTTP_FETCH_HEADER` from SRS.
* **Root Cause**: SRS accepted the SDP Offer but tried to verify the session with the Nitro Webhook (`http://host.docker.internal:3000/internal/srs/on-publish`). Vite's dev server blocked this request with a `403 Forbidden` because `host.docker.internal` was missing from Vite's `allowedHosts` security filter. SRS then aborted the WHIP session.
* **Solution**: Added `'host.docker.internal'` to `server.allowedHosts` inside `vite.config.ts`. This authorized SRS's Webhook callbacks.

---

## 5. Nginx WebSocket Proxy Timeout (1006 Abnormal Disconnects)
* **Problem**: Even though the ESP32 connection was established and sent heartbeats every 20 seconds, the Node server logged abnormal closures (`code: 1006`) and declared the device offline after 60-70 seconds, while the ESP32 continued to print successful status reports.
* **Root Cause**: Nginx has a default L7 `proxy_read_timeout` of 60 seconds. In our reverse proxy, Vite/Nitro is the upstream. Because the upstream server is completely silent during active telemetry reports (only receiving data from the client without writing anything back), Nginx's 60-second read timeout would expire, causing Nginx to abruptly close the TCP connection to Vite/Nitro.
* **Solution**: Added `proxy_read_timeout 86400s;` and `proxy_send_timeout 86400s;` to the L7 reverse proxy block in `nginx.conf`. This extends Nginx's idle timeouts to 24 hours.

---

## 6. Media Stream Stop Callback Race Condition
* **Problem**: When the ESP32 rebooted, the new Control Plane WebSocket connected and marked the device `"online"`. But shortly after, the old WebRTC stream session timed out in SRS (due to DTLS Hang) and triggered the `on_stop` callback. This callback blindly set the device status to `"offline"` in the database, overriding the active WebSocket connection.
* **Root Cause**: The `/internal/srs/on-stop` route blindly marked the device offline upon stream unpublish, regardless of whether the control plane WebSocket connection was active.
* **Solution**: Modified `on-stop.post.ts` to import `activeDevices` in-memory connection registry, and only update the device status to `"offline"` if the device has **no active Control Plane WebSocket connection**! If it is actively connected, it keeps the device `"online"`.

---

## 7. Vite Dev Server Watch Loop Ignored List
* **Problem**: Every time the database updated the device status, Vite dev server detected a file change in `.data` and triggered a server hot reload, wiping `activeDevices` in memory.
* **Root Cause**: Vite's file watcher watched the entire project root by default, including the `.data/db/` folder. Writing database updates triggered a hot reload of the Node server, resetting in-memory WebSocket collections.
* **Solution**: Configured `watch.ignored` inside `vite.config.ts` to exclude `**/.data/**`, `**/serial_log.txt`, and other files from triggering reloads.

---

## 8. WebSocket Connection Socket ID Labeling (Visual Verification)
* **Problem**: During reboot or reconnection events, the logs only printed generic `connected` and `offline` notices. If an old connection's delayed close event timed out and triggered, it printed an offline message in the console. Without identifiers, it was impossible to see *which* socket was closing (the active new one or the stale old one), leading to visual confusion.
* **Refined Log Diagnostics**: Added unique, randomly generated 7-character `Socket ID` tracking to the custom WebSocket connection context. The server now clearly labels all console outputs:
  - `[WS] Device camera_home connected and marked online. (Socket ID: X7Y8Z9)`
  - `[WS] Stale WebSocket connection for device camera_home (Socket ID: A1B2C3) closed. Ignoring.`
  - `[Grace Period] Active WebSocket connection for device camera_home (Socket ID: X7Y8Z9) disconnected abnormally...`
  This makes the exact sequence of socket life cycles completely transparent and unambiguous in the terminal logs!

---

## 9. Abrupt Client Power-Loss Detection (Nginx L4 keepalive)
* **Problem**: Abrupt client power losses do not send standard TCP FIN packets, resulting in "half-open" TCP connections that remain registered in Nginx and the Node server for hours.
* **Root Cause**: The OS default TCP keepalive check interval is 2 hours, keeping dead half-open connections alive and causing state collision and registration lag when the device reboots.
* **Solution**: Configured the socket options `so_keepalive=30s:10s:3` on port `443` in the Nginx L4 Stream Router. Nginx now actively probes idle sockets and cleanly tears down dead connections in exactly 60 seconds (30s idle + 3 probes $\times$ 10s), ensuring robust offline detection and zero lingering stale sockets!

---

## 10. Concurrent TLS Heap Exhaustion (mbedTLS PSRAM Migration)
* **Problem**: Concurrent WSS (control WebSocket), HTTPS (SDP negotiation/WHIP client), and DTLS (WebRTC handshake) connections caused severe heap exhaustion (`ESP_ERR_HTTP_FETCH_HEADER` or out-of-memory crashes) on the ESP32.
* **Root Cause**: By default, mbedTLS allocated session buffers in the precious internal DRAM. With multiple concurrent TLS connections, the DRAM heap was quickly depleted.
* **Solution**: Enabled `CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC=y` and `CONFIG_MBEDTLS_SSL_VARIABLE_BUFFER_LENGTH=y` in `sdkconfig.defaults`, migrating mbedTLS allocation to external PSRAM. This stably freed up DRAM and resolved all TLS heap exhaustion panics.

---

## 11. WebRTC Core Panics, Thread Safety & Task Stack Size
* **Problem**: A Guru Meditation Error (IllegalInstruction or StoreProhibited, `EXCCAUSE 0x0`) occurred during WebRTC peer state stabilization.
* **Root Cause**: Stack overflows and race conditions in `libpeer`'s ICE polling/streaming. The stack allocated for `whip_pc_task` was too small (16KB) for concurrent DTLS handshakes, which are highly cryptographic and stack-heavy. Additionally, running ICE polling and streaming on separate, thread-unsafe tasks caused memory races.
* **Solution**: Raised the stack size of `whip_pc_task` to 32KB (`32768`) and unified the ICE polling and streaming into a single thread-safe Core 1 task, pin-checking memory access. This cleanly avoided stack corruption and core panics during peer connection state changes.

---

## 12. WebRTC SDP Data Channel Crash & SDP Alignment
* **Problem**: WebRTC negotiation failed or crashed after handshakes because of SDP configuration differences.
* **Root Cause**: Enabling SCTP data channels (`.enable_data_channel = true` in libpeer) while manually stripping `m=application` lines from the SDP Offer to appease SRS caused a fatal crash. During the DTLS handshake completion, `libpeer` attempted to initiate SCTP associations on a data channel that was never negotiated in the SDP, leading to null pointer dereferences and crash `EXCCAUSE 0x0`.
* **Solution**: Disabled SCTP data channels completely (`.enable_data_channel = false` in `esp_peer` / `whip_client` configuration). Cleanly aligned the video codec configuration to H.264, generating standard-compliant video-only SDP Offers accepted naturally by SRS, eliminating the need for fragile manual SDP string manipulation.

---

## 13. DMA Network Buffer Coherence (LwIP DRAM Restriction)
* **Problem**: Attempting to allocate WiFi or LwIP buffers in SPIRAM (PSRAM) on the ESP32-S3 to save DRAM led to heavy packet loss and DMA incoherence.
* **Root Cause**: WiFi/LwIP network buffers require DMA access, which is highly restricted or slow on external SPIRAM, leading to memory incoherence and corrupted network packets.
* **Solution**: Kept LwIP buffers strictly in fast internal DRAM while migrating user-space tasks, mbedTLS, and camera frame buffers to SPIRAM (PSRAM), maintaining high network throughput and stable DMA transfers.

---

## 14. PSRAM Camera Frame Buffer Direct Reference
* **Problem**: Storing DRAM frame buffers for video packetization caused memory leaks and duplicate allocations.
* **Root Cause**: Using static DRAM buffers or continuous `heap_caps_realloc` for copying frames from PSRAM camera buffer to internal SRAM was extremely memory-wasteful and triggered DRAM fragmentation.
* **Solution**: Configured camera frame buffers directly in PSRAM (`.fb_location = CAMERA_FB_IN_PSRAM`), removed custom DRAM frame buffers and cache synchronization routines (`esp_cache_msync`), and refactored `whip_streamer.c` to directly reference camera frame buffer pointers (`fb->buf`), passing them directly to `esp_peer_send_video()`, and immediately returning the buffer (`esp_camera_fb_return(fb)`) inside the loop, preventing DRAM overhead.

