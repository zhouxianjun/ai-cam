# HomeGuard-RTC Phase 4: ESP32 摄像头端对接设计方案

本文档定义了 HomeGuard-RTC 项目第四阶段（Phase 4: ESP32 摄像头对接）的完整技术设计与实现规范。

---

## 1. 业务目标与边界

本阶段的核心是开发硬件采集端固件，基于 **ESP-IDF v6.x**、**C 语言**和 **FreeRTOS** 实现高性能音视频推流与实时云台指令响应：
1. **网络与虚拟解析**：实现局域网 WiFi 的稳健连接与基于 LwIP 的本地虚拟 DNS 域名解析（hosts），支持单端口 Nginx Gateway 443 域名分流。
2. **硬件驱动层（HAL）**：
   - 驱动 **OV2640** 摄像头，并开启双 PSRAM (SPIRAM) 帧缓冲区（QVGA, JPEG, 20MHz XCLK），完成零延迟、防堆积捕获。
   - 使用 **LEDC (LED Control)** 硬件外设以 50Hz、14位分辨率驱动水平（Pan）和垂直（Tilt）舵机。
3. **控制信令通道**：在 **Core 1** 维持与中台 WebSocket 的双向长连接，采用 **策略模式 (Strategy Pattern)** 实现对 PTZ (云台移动)、reboot (设备重启) 和 status_query (状态查询) 指令的高效零 `if-else` 分发。
4. **WHIP WebRTC 媒体推流**：
   - 动态向 Node.js 中台申请短效媒体 Token。
   - 向 SRS 媒体服务器发起 WHIP SDP 协议握手，解析 SDP Answer 并开启 WebRTC over TCP 物理推流。
   - 在 **Core 0** 开启 FreeRTOS 高优先级发送循环，平滑推送 30FPS 视频数据并杜绝内存泄漏。

---

## 2. 物理与开发配置设计

### 2.1 依赖关系包声明 (`main/idf_component.yml`)
所有外部依赖均通过 ESP Component Manager 统一自动拉取与管理，严禁在项目中手动塞入任何第三方源码：

```yaml
dependencies:
  # 乐鑫 WebRTC 核心组件 (包含 libjuice + mbedtls)
  espressif/esp-webrtc-solution: "^1.0.0"
  # 官方网络组件库 (提供 websocket_client 和 esp_tls)
  espressif/esp-protocols: "^3.0.0"
  # 摄像头底层驱动包
  espressif/esp32-camera: "^2.0.0"
  # JSON 结构解析包
  espressif/cjson: "^1.7.15"
```

### 2.2 固件硬编码配置文件 (`main/config.h`)
固件全局配置，所有硬件引脚与局域网 IP 直连域名注入在此统一管理：

```c
#ifndef _APP_CONFIG_H_
#define _APP_CONFIG_H_

// =========================================================================
// 1. 网络与 WiFi 配置
// =========================================================================
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASS           "YOUR_WIFI_PASSWORD"
#define RETRY_BACKOFF_MAX   30                 // 最大 WiFi 重连间隔 (秒)

// =========================================================================
// 2. 本地开发电脑局域网 IP
// =========================================================================
#define LOCAL_SERVER_IP     "192.168.1.9"      // Nginx 网关及服务所在电脑 IP

// =========================================================================
// 3. 业务域名与服务端口
// =========================================================================
#define DOMAIN_APP          "app.local.test"   // 业务中台控制面域名
#define DOMAIN_MEDIA        "media.local.test" // 媒体面域名
#define SERVER_PORT         443                // Nginx 统一 TCP 监听端口

// =========================================================================
// 4. 设备安全身份凭证
// =========================================================================
#define DEVICE_ID           "camera_home"      // 设备唯一 ID
#define DEVICE_SECRET       "device_secret_123456" // 设备与中台预共享密钥

// =========================================================================
// 5. 摄像头底层采集与驱动引脚定义 (OV2640)
// =========================================================================
#define CAM_PWDN_GPIO      -1
#define CAM_RESET_GPIO     -1
#define CAM_XCLK_GPIO      15
#define CAM_SIOD_GPIO       4
#define CAM_SIOC_GPIO       5
#define CAM_Y9_GPIO        16
#define CAM_Y8_GPIO        17
#define CAM_Y7_GPIO        18
#define CAM_Y6_GPIO        12
#define CAM_Y5_GPIO        10
#define CAM_Y4_GPIO         8
#define CAM_Y3_GPIO         9
#define CAM_Y2_GPIO        11
#define CAM_VSYNC_GPIO      6
#define CAM_HREF_GPIO       7
#define CAM_PCLK_GPIO      13

#define CAM_XCLK_FREQ      20000000            // XCLK 20MHz 频率
#define CAM_FRAME_SIZE     FRAMESIZE_QVGA      // QVGA 320x240 分辨率
#define CAM_JPEG_QUALITY   12                  // 压缩品质比 12

// =========================================================================
// 6. 舵机控制引脚定义 (SG90/MG90S)
// =========================================================================
#define SERVO_PAN_PIN      1                   // 水平舵机引脚
#define SERVO_TILT_PIN     2                   // 垂直舵机引脚

#endif // _APP_CONFIG_H_
```

---

## 3. 驱动适配层（HAL Layer）设计

### 3.1 摄像头采集驱动 (`components/camera_hal/`)
- 物理驱动基于 `esp32-camera` 库进行初始化。
- **PSRAM 显式绑定**：强制使能 `config.fb_in_psram = true`，在大吞吐推流时通过 8MB PSRAM 进行双帧缓冲，完全不挤占 Sram 堆空间。
- **流控设计**：采用 `CAMERA_GRAB_LATEST` 帧抓取模式，并在进入发送队列前校验 TCP 缓存队列状态，避免在网络延时下导致内存崩溃。

### 3.2 舵机驱动 (`components/servo_hal/`)
- 基于 ESP32-S3 **LEDC** 外设实现硬件级的脉宽调制驱动。
- **定时器参数**：低速工作模式，采用 `LEDC_TIMER_1` 定时器以 **50Hz** (20ms 周期) 频率驱动。
- **超高角度精度**：使能 **14位 分辨率 (0 - 16383级)**，通过如下数学映射转换将用户指令的 `0° - 180°` 完美映射为高精度 Duty 级数：
  $$\text{Duty} = 410 + \frac{\text{angle} \times (2048 - 410)}{180}$$
- 提供外部线程安全的公共 API `app_servo_set_angle(int pan_angle, int tilt_angle)` 用于实时调整方向。

---

## 4. 网络通信与控制信令设计

### 4.1 DNS 虚拟 Hosts 动态注入
由于 ESP32 单片机无法解析 hosts 文件中配置的 `app.local.test` 和 `media.local.test` 域名。固件连上 WiFi 后，会调用 LwIP 底层的局部解析接口，将开发机 IP 解析到对应域名上，既保障域名证书分流正常运行，又保持网络透明：

```c
#include "lwip/dns.h"
#include "config.h"

void app_dns_inject_hosts() {
    ip_addr_t server_ip;
    if (ipaddr_aton(LOCAL_SERVER_IP, &server_ip)) {
        dns_local_addhost(DOMAIN_APP, &server_ip);
        dns_local_addhost(DOMAIN_MEDIA, &server_ip);
        ESP_LOGI("APP_DNS", "Successfully mapped domains to %s", LOCAL_SERVER_IP);
    }
}
```

### 4.2 统一信令控制通道 (WebSocket Control Plane)
- 运行在 **Core 1** 上的独立 FreeRTOS 任务，优先级设为 `5`。
- WebSocket 连接目标：`wss://app.local.test:443/control?role=device&deviceId=camera_home&token=device_secret_123456`
- 安全设定：连接参数中开启 `skip_cert_common_name_check = true` 跳过本地 mkcert CA 的完整性验证。

### 4.3 策略模式指令分发机制 (Strategy Pattern)
为完全杜绝嵌入式开发中巨型 if-else/switch 语句，我们将命令拆分为结构体函数指针映射表（策略模式）。
```c
typedef void (*command_handler_t)(const cJSON *payload);

typedef struct {
    const char *cmd_name;
    command_handler_t handler;
} command_route_t;

// 1. PTZ 舵机移动处理器
void handle_ptz_move(const cJSON *payload) {
    cJSON *pan = cJSON_GetObjectItem(payload, "pan");
    cJSON *tilt = cJSON_GetObjectItem(payload, "tilt");
    if (pan && tilt) {
        app_servo_set_angle(pan->valueint, tilt->valueint);
    }
}

// 2. 状态查询处理器与上报 (Telemetry)
void handle_status_query(const cJSON *payload) {
    app_control_plane_report_status();
}

// 3. 系统安全重启处理器
void handle_reboot(const cJSON *payload) {
    esp_restart();
}

// 策略指令分发路由注册表 (只读 Flash 固化)
static const command_route_t cmd_routing_table[] = {
    {"ptz",          handle_ptz_move},
    {"reboot",       handle_reboot},
    {"status_query", handle_status_query},
};
```

---

## 5. WHIP WebRTC 视频流设计

### 5.1 双层媒体 Action Token 动态接入
1. ESP32 连上局域网后，首先对 Node.js 业务服务器发起标准的 HTTPS POST：
   `POST https://app.local.test:443/api/devices/publish-token`
   载荷结构：
   ```json
   {
     "deviceId": "camera_home",
     "secret": "device_secret_123456",
     "app": "live",
     "stream": "camera_home"
   }
   ```
2. 收到 200 响应后，使用 `cJSON` 提取短效的带 HMAC 签名的媒体 Action Token。

### 5.2 WHIP 协议 Offer/Answer SDP 握手
1. ESP32 使用 `esp-webrtc-solution` 接口生成本地的 SDP Offer 数据包。
2. 对 SRS 发起标准的 WHIP SDP POST 协商：
   `POST https://media.local.test:443/rtc/v1/whip/?app=live&stream=camera_home&token=<Action_Token>`
   请求 Header：`Content-Type: application/sdp`
   请求 Body：`Local Offer SDP`
3. 校验 SRS 返回的 `201 Created`，提取响应体中的 `Answer SDP` 注入底层 ICE 协议栈，建立基于 WebRTC over TCP 的极低延迟通道。

### 5.3 核心推流循环与流控 (Core 0 WebRTC Task)
- 运行 in **Core 0** 上的独立高优先级任务（优先级 `6`，保证媒体传输与 LwIP 内核的高速通信效率）。
- **流程图与代码闭环**：
  ```c
  while (1) {
      camera_fb_t *fb = esp_camera_fb_get(); // 1. 抓取最新帧缓冲
      if (fb) {
          esp_webrtc_send_video_frame(fb->buf, fb->len); // 2. 经由 RTP/WebRTC over TCP 发送
          esp_camera_fb_return(fb); // 3. 必须立即释放，防止内存堆积泄露
      }
      vTaskDelay(pdMS_TO_TICKS(33)); // 4. 平滑流控 (约30FPS)
  }
  ```

---

## 6. 开发、烧录与验证路线图

设备连接在 **`com8`**。在项目 spec 获准通过后，我们将执行以下固件构建和测试闭环：

### 6.1 物理编译烧录流程
在 `esp32-client/` 根目录下，将通过以下命令行完成依赖下载与固件部署：
```powershell
# 1. 自动拉取组件管理器中的依赖包并完成硬件配置菜单检查
idf.py reconfigure

# 2. 编译整个固件并开始向 com8 物理端口进行 460800 波特率烧录与串口监控监听
idf.py -p com8 -b 460800 flash monitor
```

### 6.2 渐进式验证方案（Verification Plan）
1. **WiFi 与 DNS 解析验证**：固件启动后，观察 `monitor` 串口输出，验证是否显示 `Successfully mapped domains to 192.168.1.9`，并使用 ping 辅助测试解析。
2. **中台握手与注册验证**：
   - 验证 ESP32 连上 WiFi 后向 `/api/devices/register` 接口上报注册成功。
   - 检查 Nitro 后端控制台是否输出 `[WS] Device camera_home connected and marked online.`，证明 WebSocket 连接及身份校验完全通过。
3. **控制指令闭环测试**：
   - 打开 Web 控制终端或测试脚本，下发 `ptz` 指令 `{ pan: 45, tilt: 135 }`。
   - 确认 ESP32 串口打印 `[SERVO_HAL] Set servo angle to Pan: 45, Tilt: 135`，且示波器/舵机发生相应旋转。
   - 下发 `reboot` 指令，观察串口设备是否成功自重启。
4. **WHIP 音视频推流验证**：
   - 观察串口，确认 WHIP 协商输出 `WHIP negotiation successful! Received Answer SDP`。
   - 打开 WHEP 播放页面，确认视频画面在 QVGA 分辨率下以接近零延迟的 30FPS 速度流畅播放，且 heap 堆可用内存恒定无下探趋势。
