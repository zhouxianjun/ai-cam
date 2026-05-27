# ESP32 硬件端开发规范

> ESP-IDF v6.x · C Language · FreeRTOS · esp-webrtc-solution

## 技术栈与框架参考

在进行 ESP32 采集端开发前，应熟知以下核心框架与协议栈：

```text
ESP-IDF 官方文档       → https://docs.espressif.com/projects/esp-idf/zh_CN/latest/esp32/
esp-webrtc-solution  → 乐鑫 WebRTC 解决方案，底层基于 libjuice (ICE) 与 mbedtls (DTLS/SRTP)
esp-protocols        → 包含 websocket_client, esp-mqtt 等网络组件
esp32-camera         → 摄像头驱动组件，支持 OV2640、OV5640 等传感器
```

---

## 1. 推荐项目结构与依赖管理

建议硬件端代码存放在根目录的 `esp32-client/` 下。

### 1.1 依赖管理：`idf_component.yml`

对于第三方开源依赖库（如 `esp-webrtc-solution`、`esp-protocols` 等），**绝对禁止手动下载源码并强行塞入项目目录**。
ESP-IDF v6.x 拥有完善的官方组件注册表，只需在构建目标目录下（如 `main/` 目录）创建 `idf_component.yml` 文件声明依赖，构建系统会在编译时自动下载、安装并管理这些组件。

### 1.2 项目物理结构

因此，本地的 `components/` 目录应**纯粹用于项目内部的业务逻辑拆分与分层设计**：

```text
esp32-client/
  ├── CMakeLists.txt        # 项目根 CMake 构建文件
  ├── sdkconfig.defaults    # 预设配置（如启用 PSRAM、Flash 频率、LwIP TCP/IP 微调）
  ├── partitions.csv        # 分区表定义（建议为 OTA 及 WebRTC 大吞吐量分配足够空间）
  ├── main/                 # 主程序入口
  │     ├── CMakeLists.txt
  │     ├── Kconfig.projbuild # 编译配置菜单选项（WiFi、推流配置等）
  │     ├── idf_component.yml # 依赖配置文件：自动托管 WebRTC/WebSocket 等包
  │     └── main.c          # 系统初始化与 App 启动入口
  └── components/           # 内部业务组件（*严禁放第三方库源码，仅用于业务解耦*）
        ├── wifi_manager/   # 业务层：WiFi 连接、重连状态机与网络事件分发
        ├── whip_client/    # 业务层：WHIP 协议推流控制逻辑（HTTPS Offer/Answer 协商）
        ├── control_plane/  # 业务层：控制信令接收、JSON 解析与指令路由分发
        └── camera_hal/     # 驱动层：摄像头配置、采集率流控与硬件抽象
```

---

## 2. 目录职责与业务边界

在 C 语言大中型嵌入式项目中，**组件拆分必须服务于“业务边界解耦”**，而不是简单的代码乱塞。

### 2.1 wifi_manager (网络状态管理器)

- **职责**：负责 WiFi 的配置初始化、扫网连接、断线后基于指数退避算法（Exponential Backoff）的自动安全重连。
- **设计规范**：
  - 基于 ESP-IDF Event Loop，监听 `WIFI_EVENT` 和 `IP_EVENT`。
  - 成功获取 IP 后，向系统分发自定义事件 `APP_EVENT_NETWORK_CONNECTED`，通知控制面和推流客户端初始化，**禁止直接在这两个模块中耦合 WiFi 状态判断**。

### 2.2 whip_client (WHIP 媒体推流协调器)

- **职责**：控制 WHIP 推流的启动与停止。
- **流程**：
  1. 通过标准 HTTPS POST 向中枢指定的 WHIP 接口发送带 Token 的本地 SDP Offer。
  2. 解析 SRS 返回的 201 Created 响应头中的 WHEP/WHIP 资源路径，并获取服务器的 SDP Answer。
  3. 调用 `esp-webrtc-solution` 接口建立 WebRTC TCP 媒体连接。
  4. 协调 `camera_hal` 抓取帧，并调用 WebRTC RTP API 发送。

### 2.3 control_plane (信令控制面)

- **职责**：与 Node.js 业务中台维持稳定的 WebSocket 双向信令通道。
- **设计规范**：
  - 启动独立的 FreeRTOS 任务循环执行客户端读写。
  - **禁止在数据包接收回调中执行任何阻塞式的物理动作**（例如马达旋转、传感器读取）。必须通过 FreeRTOS Queue 将解析后的动作派发给对应的任务去执行。

### 2.4 camera_hal (摄像头物理驱动与图像采集)

- **职责**：管理 OV2640/OV5640 等图像传感器，向上层（推流端）提供格式统一的高质量帧缓冲数据。
- **设计规范**：
  - 必须合理配置并启用 **PSRAM**，确保有足够的帧缓冲区。
  - 内部实现采集流控，当推流端发送缓存堆积时，驱动层应支持主动降帧率或丢帧，防范内存泄露。

---

## 3. C 语言开发与 FreeRTOS 规范

### 3.1 内存管理与安全

- **严禁使用 `malloc`**：统一使用 ESP-IDF 的堆内存分配器 API：
  - 一般内存：`heap_caps_malloc(size, MALLOC_CAP_8BIT)`
  - 大缓冲区/帧缓冲（必须在 PSRAM 中）：`heap_caps_malloc(size, MALLOC_CAP_SPIRAM)`。
- **防止内存泄露**：对于 `cJSON_Print` 分配的字符串、HTTPS 请求接收到的响应体，必须在函数退出前显式 `free()`，并在创建任务时仔细规划 Stack 大小以防栈溢出。

### 3.2 任务管理 (FreeRTOS Tasks)

- 涉及网络 IO（如 WebSocket、WebRTC 发送）的任务，建议绑定在 **Core 1**，避免干扰 **Core 0** 上的 WiFi/IP 协议栈底层处理。
- **任务创建模板**：

  ```c
  // 定义任务栈大小
  #define CONTROL_TASK_STACK_SIZE (8 * 1024)

  void control_task(void *pvParameters) {
      ESP_LOGI(TAG, "Control plane task started on core %d", xPortGetCoreID());
      while (1) {
          // 接收队列并处理
          vTaskDelay(pdMS_TO_TICKS(100)); // 避免空转，合理让出 CPU 时间片
      }
      vTaskDelete(NULL); // 任务自销毁
  }

  // 在初始化中调用
  xTaskCreatePinnedToCore(control_task, "control_task", CONTROL_TASK_STACK_SIZE, NULL, 5, NULL, 1);
  ```

### 3.3 严格错误处理

- 关键系统调用及 API 返回值必须进行校验。
- 拒绝随意使用 `ESP_ERROR_CHECK()` 导致设备在运行时直接崩溃重启（Crash Loop）。
- **正确示范**：
  ```c
  esp_err_t err = esp_wifi_start();
  if (err != ESP_OK) {
      ESP_LOGE(TAG, "WiFi start failed: %s", esp_err_to_name(err));
      // 优雅降级或触发指数退避重试，严禁直接 panic
      return err;
  }
  ```

### 3.4 日志规范

- 统一使用 `ESP_LOGx` 宏进行日志输出，严禁在生产代码中使用裸 `printf`。
- 设定清晰的日志标签（TAG），并在发布版本（Release）中，通过 `menuconfig` 将默认日志级别设为 `INFO`，剔除 `DEBUG` 和 `VERBOSE` 以减少串口吞吐和 CPU 占用。

---

## 4. 业务拆分与分层设计规范

嵌入式 C 语言最容易陷入的误区是“单文件万能（Monolithic）”以及“无尽的 `if-else / switch-case` 信令匹配”。为确保代码的可维护性，必须强制执行以下分层规范：

### 4.1 核心分层模型

项目整体分为三层，层与层之间仅能通过暴露的公共 API 或事件总线（Event Group / Queue）进行单向通信：

1. **驱动适配层 (HAL Layer)**：纯粹的硬件设备操作（如摄像头参数调整、云台步进电机驱动）。
   - _红线_：禁止引入任何网络、HTTPS、WebSocket 或具体的 JSON 指令业务逻辑。
2. **传输/协议层 (Transport Layer)**：负责 WebRTC 推流与 WebSocket 连接。
   - _红线_：只管通道建立、报文收发及状态上报，不决定何时转动镜头，也不应知道具体的硬件寄存器操作。
3. **业务应用层 (App/Coordination Layer)**：作为中枢控制器，负责业务流转与指令路由。
   - _规范_：从 WebSocket 接收到指令后，在此层分发路由，去调用驱动层的公共 API。

### 4.2 消除巨型 `if-else` / `switch-case` 链（策略模式）

在控制面处理 WebSocket 接收到的 JSON 命令时，**绝对禁止**写出一大坨类似于 `if (strcmp(cmd, "move") == 0) ... else if (strcmp(cmd, "shoot") == 0) ...` 的长链代码。

必须使用 **策略映射表（结构体数组 + 函数指针）** 进行路由分发：

```c
// 1. 定义统一的 Handler 函数指针签名
typedef void (*command_handler_t)(const cJSON *payload);

// 2. 声明具体的 Handler 业务函数（每个函数保持简短，不超过 50 行）
void handle_gimbal_move(const cJSON *payload) {
    cJSON *angle = cJSON_GetObjectItem(payload, "angle");
    if (angle) {
        // 调用 HAL 层 API
        hal_gimbal_set_angle(angle->valueint);
    }
}

void handle_camera_zoom(const cJSON *payload) {
    cJSON *factor = cJSON_GetObjectItem(payload, "factor");
    if (factor) {
        // 调用 HAL 层 API
        hal_camera_set_zoom(factor->valuedouble);
    }
}

// 3. 定义策略路由表项结构体
typedef struct {
    const char *cmd_name;          // 指令名称
    command_handler_t handler;    // 处理函数
} command_route_t;

// 4. 注册策略映射表（只读，存放在 Flash 中）
static const command_route_t cmd_routing_table[] = {
    {"gimbal:move", handle_gimbal_move},
    {"camera:zoom", handle_camera_zoom},
};

// 5. 统一路由分发器，完全零 if-else 长链
void control_plane_dispatch(const char *cmd, const cJSON *payload) {
    size_t table_size = sizeof(cmd_routing_table) / sizeof(command_route_t);

    for (size_t i = 0; i < table_size; i++) {
        if (strcmp(cmd, cmd_routing_table[i].cmd_name) == 0) {
            cmd_routing_table[i].handler(payload); // 路由命中并分发
            return;
        }
    }
    ESP_LOGW("CTRL_PLANE", "Unsupported command received: %s", cmd);
}
```

### 4.3 单文件与函数限制

- **文件行数**：单个 `.c` 文件代码行数应控制在 **300行以内**。如果超出，必须以单一职责原则（Single Responsibility）进行二次拆分。
- **函数长度**：单个函数行数严格控制在 **50行以内**，避免高复杂度、深嵌套的逻辑。

---

## 5. 网络安全与 TLS 配置

### 5.1 双向 TLS 校验

ESP32 连接到 Node.js API 及 SRS 媒体端时，必须强制启用 TLS（HTTPS / WSS）：

- 将根 CA 证书以 **PEM** 格式嵌入为 ESP32 固件的二进制资源（Embed Files）。
- 初始化 `esp_tls_cfg_t` 时指定 `.cacert_pem_buf`。
- 严禁在生产固件中开启 `.skip_common_name` 选项。

### 5.2 NVS 隐私存储 (Non-Volatile Storage)

- 设备的 WiFi 账号密码、设备绑定的独有唯一证书、设备标识符等敏感数据，必须存储在加密的 **NVS** 分区中。
- 不得在固件源码中硬编码（Hardcode）任何长效 Token 或密码。

---

## 6. WebRTC 与流媒体微调 (LwIP & TCP)

WebRTC over TCP 会在短时间内产生高吞吐量，必须在 `sdkconfig` 中对网络协议栈进行微调，以防出现丢包和延迟堆积：

- **LwIP 微调项**：
  - 增大 `CONFIG_LWIP_TCP_SND_BUF_DEFAULT`（默认 TCP 发送缓存区，建议调整为 16K 以上）。
  - 增大 `CONFIG_LWIP_TCP_WND_DEFAULT`（接收窗口，建议调整为 16K 以上）。
- **帧缓冲流控**：
  - 采集到的帧在进入 TCP 发送队列前，必须做流控（Rate Limiting）。若检测到网络发送缓存已满，应主动丢弃非关键帧（Non-Key Frames/P-Frames），确保实时性。

---

## 7. 核心编译开发命令

编译烧录交给用户
