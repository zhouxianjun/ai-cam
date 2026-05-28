# ESP32 摄像头端对接 (Phase 4) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 ESP-IDF v6.x 构建高稳定性 ESP32-S3 采集端固件，接入单端口 Nginx Gateway 网关实现超低延迟 WebRTCover TCP 视频推流，并通过基于策略模式的 WebSocket 接收中台 PTZ 控制指令驱动水平/垂直舵机。

**Architecture:** 固件由四层解耦组件构成：`wifi_manager` 维护连网状态并动态向 LwIP 写入虚拟 hosts 映射解析；`camera_hal` 驱动 OV2640 进行双 PSRAM 帧缓冲捕获；`servo_hal` 通过 50Hz/14位分辨率 LEDC 电路驱动舵机；`control_plane` 运行于 Core 1，基于策略路由表通过 WebSocket 通道响应 PTZ/Reboot/Status 指令；`whip_client` 运行于 Core 0，动态拉取 publish-token 并发起 WHIP Offer，打通 TCP-RTC 媒体推流。

**Tech Stack:** ESP-IDF v6.x, FreeRTOS, esp-webrtc-solution, esp-protocols (websocket_client, esp_tls), cJSON, esp32-camera, LEDC Peripheral.

---

### Task 1: ESP32-S3 工程脚手架与依赖托管配置

**Files:**
- Create: `esp32-client/CMakeLists.txt`
- Create: `esp32-client/sdkconfig.defaults`
- Create: `esp32-client/partitions.csv`
- Create: `esp32-client/main/CMakeLists.txt`
- Create: `esp32-client/main/idf_component.yml`
- Create: `esp32-client/main/config.h`
- Create: `esp32-client/main/main.c`

- [ ] **Step 1: 创建工程根 CMake 构建脚本**
  
  写入 `esp32-client/CMakeLists.txt`：
  ```cmake
  cmake_minimum_required(VERSION 3.16)
  include($ENV{IDF_PATH}/tools/cmake/project.cmake)
  project(homeguard_esp32_client)
  ```

- [ ] **Step 2: 配置默认 SDK 选项（PSRAM 与 LwIP 调优）**
  
  写入 `esp32-client/sdkconfig.defaults`，特别开启 PSRAM 支持并放大 TCP 发送接收缓存以满足 WebRTC 高吞吐：
  ```ini
  # Target Config
  CONFIG_IDF_TARGET="esp32s3"

  # SPIRAM / PSRAM (8MB Octal)
  CONFIG_SPIRAM=y
  CONFIG_SPIRAM_TYPE_AUTO=y
  CONFIG_SPIRAM_SIZE=-1
  CONFIG_SPIRAM_SPEED_80M=y
  CONFIG_SPIRAM_MODE_OCT=y

  # System & Heap Allocator
  CONFIG_ESP_SYSTEM_EVENT_QUEUE_SIZE=32
  CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096

  # LwIP TCP/IP Tuning for High Throughput WebRTC
  CONFIG_LWIP_TCP_SND_BUF_DEFAULT=32768
  CONFIG_LWIP_TCP_WND_DEFAULT=32768
  CONFIG_LWIP_TCP_RECVMBOX_SIZE=32
  ```

- [ ] **Step 3: 定义 16MB Flash 分区表**
  
  写入 `esp32-client/partitions.csv`：
  ```csv
  # Name,   Type, SubType, Offset,  Size, Flags
  nvs,      data, nvs,     ,        0x6000,
  phy_init, data, phy,     ,        0x1000,
  factory,  app,  factory, ,        0x300000,
  storage,  data, fat,     ,        0x9E0000,
  ```

- [ ] **Step 4: 创建 main 模块构建脚本**
  
  写入 `esp32-client/main/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "main.c"
                         INCLUDE_DIRS "."
                         REQUIRES wifi_manager camera_hal servo_hal control_plane whip_client)
  ```

- [ ] **Step 5: 声明官方依赖包托管文件**
  
  写入 `esp32-client/main/idf_component.yml`：
  ```yaml
  dependencies:
    espressif/esp-webrtc-solution: "^1.0.0"
    espressif/esp-protocols: "^3.0.0"
    espressif/esp32-camera: "^2.0.0"
    espressif/cjson: "^1.7.15"
  ```

- [ ] **Step 6: 编写硬件引脚与局域网网络全局配置**
  
  写入 `esp32-client/main/config.h`：
  ```c
  #ifndef _APP_CONFIG_H_
  #define _APP_CONFIG_H_

  #define WIFI_SSID           "YOUR_WIFI_SSID"
  #define WIFI_PASS           "YOUR_WIFI_PASSWORD"
  #define RETRY_BACKOFF_MAX   30

  #define LOCAL_SERVER_IP     "192.168.1.9"
  #define DOMAIN_APP          "app.local.test"
  #define DOMAIN_MEDIA        "media.local.test"
  #define SERVER_PORT         443

  #define DEVICE_ID           "camera_home"
  #define DEVICE_SECRET       "device_secret_123456"

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

  #define CAM_XCLK_FREQ      20000000
  #define CAM_FRAME_SIZE     FRAMESIZE_QVGA
  #define CAM_JPEG_QUALITY   12

  #define SERVO_PAN_PIN      1
  #define SERVO_TILT_PIN     2

  #endif
  ```

- [ ] **Step 7: 编写主程序极简调度初始化入口**
  
  写入 `esp32-client/main/main.c`：
  ```c
  #include <stdio.h>
  #include "nvs_flash.h"
  #include "esp_log.h"

  void app_main(void) {
      ESP_LOGI("MAIN", "HomeGuard-RTC Camera Client Booting...");
      
      // 初始化非易失性存储 NVS
      esp_err_t ret = nvs_flash_init();
      if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
          ESP_ERROR_CHECK(nvs_flash_erase());
          ret = nvs_flash_init();
      }
      ESP_ERROR_CHECK(ret);

      ESP_LOGI("MAIN", "NVS Storage Initialized Successfully.");
  }
  ```

- [ ] **Step 8: 验证构建系统**
  
  Run in `esp32-client/` directory:
  `idf.py reconfigure`
  Expected output: ESP-IDF component manager successfully registers and downloads four packages (`esp-webrtc-solution`, `esp-protocols`, `esp32-camera`, `cjson`), generating a clean CMake build structure.

- [ ] **Step 9: Commit**
  
  ```bash
  git add esp32-client/
  git commit -m "feat(esp32): bootstrap CMake skeleton and fetch dependencies"
  ```

---

### Task 2: WiFi 管理器组件与 DNS 虚拟 Hosts 动态注入

**Files:**
- Create: `esp32-client/components/wifi_manager/CMakeLists.txt`
- Create: `esp32-client/components/wifi_manager/include/wifi_manager.h`
- Create: `esp32-client/components/wifi_manager/wifi_manager.c`
- Modify: `esp32-client/main/main.c`

- [ ] **Step 1: 编写 WiFi 组件构建脚本**
  
  写入 `esp32-client/components/wifi_manager/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "wifi_manager.c"
                         INCLUDE_DIRS "include"
                         REQUIRES esp_wifi)
  ```

- [ ] **Step 2: 声明 WiFi 管理器与 DNS 注入的头文件**
  
  写入 `esp32-client/components/wifi_manager/include/wifi_manager.h`：
  ```c
  #ifndef _WIFI_MANAGER_H_
  #define _WIFI_MANAGER_H_

  #include "esp_err.h"

  // 连网成功后向系统广播的 Event Loop 事件
  ESP_EVENT_DECLARE_BASE(APP_EVENT);
  enum {
      APP_EVENT_NETWORK_CONNECTED
  };

  esp_err_t app_wifi_init(void);

  #endif
  ```

- [ ] **Step 3: 编写 WiFi 管理与 DNS 映射核心逻辑**
  
  写入 `esp32-client/components/wifi_manager/wifi_manager.c`，使用指数退避算法安全重连，并在连网成功后向 LwIP 中动态写入 Hosts 域名解析映射：
  ```c
  #include <string.h>
  #include "esp_wifi.h"
  #include "esp_log.h"
  #include "esp_event.h"
  #include "lwip/dns.h"
  #include "wifi_manager.h"
  #include "config.h"

  static const char *TAG = "WIFI_MGR";
  static int retry_num = 0;

  ESP_EVENT_DEFINE_BASE(APP_EVENT);

  static void event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
      if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
          esp_wifi_connect();
      } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
          int delay = (1 << retry_num);
          if (delay > RETRY_BACKOFF_MAX) {
              delay = RETRY_BACKOFF_MAX;
          }
          ESP_LOGW(TAG, "WiFi disconnected. Retrying in %d seconds...", delay);
          vTaskDelay(pdMS_TO_TICKS(delay * 1000));
          retry_num++;
          esp_wifi_connect();
      } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
          ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
          ESP_LOGI(TAG, "Successfully connected to WiFi. Allocated IP: " IPSTR, IP2STR(&event->ip_info.ip));
          retry_num = 0;

          // 动态注入虚拟 hosts
          ip_addr_t server_ip;
          if (ipaddr_aton(LOCAL_SERVER_IP, &server_ip)) {
              dns_local_addhost(DOMAIN_APP, &server_ip);
              dns_local_addhost(DOMAIN_MEDIA, &server_ip);
              ESP_LOGI(TAG, "DNS: Successfully mapped %s & %s to %s", DOMAIN_APP, DOMAIN_MEDIA, LOCAL_SERVER_IP);
          }

          // 向系统广播连网成功事件
          esp_event_post(APP_EVENT, APP_EVENT_NETWORK_CONNECTED, NULL, 0, portMAX_DELAY);
      }
  }

  esp_err_t app_wifi_init(void) {
      ESP_ERROR_CHECK(esp_netif_init());
      ESP_ERROR_CHECK(esp_event_loop_create_default());
      esp_netif_create_default_wifi_sta();

      wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
      ESP_ERROR_CHECK(esp_wifi_init(&cfg));

      esp_event_handler_instance_t instance_any_id;
      esp_event_handler_instance_t instance_got_ip;
      ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL, &instance_any_id));
      ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &event_handler, NULL, &instance_got_ip));

      wifi_config_t wifi_config = {
          .sta = {
              .ssid = WIFI_SSID,
              .password = WIFI_PASS,
          },
      };
      ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
      ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
      ESP_ERROR_CHECK(esp_wifi_start());

      ESP_LOGI(TAG, "WiFi Initialization complete.");
      return ESP_OK;
  }
  ```

- [ ] **Step 4: 在主调度中启动 WiFi**
  
  修改 `esp32-client/main/main.c`：
  ```c
  #include <stdio.h>
  #include "nvs_flash.h"
  #include "esp_log.h"
  #include "wifi_manager.h" // 引入 wifi 头文件

  void app_main(void) {
      ESP_LOGI("MAIN", "HomeGuard-RTC Camera Client Booting...");
      
      esp_err_t ret = nvs_flash_init();
      if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
          ESP_ERROR_CHECK(nvs_flash_erase());
          ret = nvs_flash_init();
      }
      ESP_ERROR_CHECK(ret);
      ESP_LOGI("MAIN", "NVS Storage Initialized Successfully.");

      // 启动 WiFi 管理器
      ESP_ERROR_CHECK(app_wifi_init());
  }
  ```

- [ ] **Step 5: 本地编译与网络环境测试**
  
  请修改 `esp32-client/main/config.h` 中的 `WIFI_SSID` 和 `WIFI_PASS` 为您真实的无线热点信息。
  在 `esp32-client/` 路径下执行：
  `idf.py -p com8 build flash monitor`
  验证：观察串口日志，设备是否能成功连接到 WiFi 并解析出 `allocated IP` 且打印 `DNS: Successfully mapped app.local.test & media.local.test to 192.168.1.9`。

- [ ] **Step 6: Commit**
  
  ```bash
  git add esp32-client/components/wifi_manager/ esp32-client/main/main.c
  git commit -m "feat(esp32): add wifi_manager component and dynamic local hosts mapping"
  ```

---

### Task 3: 摄像头采集硬件抽象层（camera_hal）与舵机控制器驱动（servo_hal）

**Files:**
- Create: `esp32-client/components/camera_hal/CMakeLists.txt`
- Create: `esp32-client/components/camera_hal/include/camera_hal.h`
- Create: `esp32-client/components/camera_hal/camera_hal.c`
- Create: `esp32-client/components/servo_hal/CMakeLists.txt`
- Create: `esp32-client/components/servo_hal/include/servo_hal.h`
- Create: `esp32-client/components/servo_hal/servo_hal.c`
- Modify: `esp32-client/main/main.c`

- [ ] **Step 1: 编写 Camera HAL 组件构建文件**
  
  写入 `esp32-client/components/camera_hal/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "camera_hal.c"
                         INCLUDE_DIRS "include"
                         REQUIRES esp32-camera)
  ```

- [ ] **Step 2: 创建 Camera HAL 头文件声明**
  
  写入 `esp32-client/components/camera_hal/include/camera_hal.h`：
  ```c
  #ifndef _CAMERA_HAL_H_
  #define _CAMERA_HAL_H_

  #include "esp_err.h"

  esp_err_t app_camera_init(void);

  #endif
  ```

- [ ] **Step 3: 编写 Camera HAL 核心驱动适配代码**
  
  写入 `esp32-client/components/camera_hal/camera_hal.c`，显式配置双 PSRAM 缓冲和最新的帧抓取流控：
  ```c
  #include "esp_camera.h"
  #include "esp_log.h"
  #include "camera_hal.h"
  #include "config.h"

  static const char *TAG = "CAMERA_HAL";

  esp_err_t app_camera_init(void) {
      camera_config_t config = {
          .pin_pwdn = CAM_PWDN_GPIO,
          .pin_reset = CAM_RESET_GPIO,
          .pin_xclk = CAM_XCLK_GPIO,
          .pin_sscb_sda = CAM_SIOD_GPIO,
          .pin_sscb_scl = CAM_SIOC_GPIO,
          
          .pin_d7 = CAM_Y9_GPIO,
          .pin_d6 = CAM_Y8_GPIO,
          .pin_d5 = CAM_Y7_GPIO,
          .pin_d4 = CAM_Y6_GPIO,
          .pin_d3 = CAM_Y5_GPIO,
          .pin_d2 = CAM_Y4_GPIO,
          .pin_d1 = CAM_Y3_GPIO,
          .pin_d0 = CAM_Y2_GPIO,
          .pin_vsync = CAM_VSYNC_GPIO,
          .pin_href = CAM_HREF_GPIO,
          .pin_pclk = CAM_PCLK_GPIO,
          
          .xclk_freq_hz = CAM_XCLK_FREQ,
          .ledc_timer = LEDC_TIMER_0,
          .ledc_channel = LEDC_CHANNEL_0,
          
          .pixel_format = PIXFORMAT_JPEG,
          .frame_size = CAM_FRAME_SIZE,
          .jpeg_quality = CAM_JPEG_QUALITY,
          .fb_count = 2,
          .grab_mode = CAMERA_GRAB_LATEST,
          .fb_in_psram = true // 强制定向分配在 SPIRAM/PSRAM 中
      };

      esp_err_t err = esp_camera_init(&config);
      if (err != ESP_OK) {
          ESP_LOGE(TAG, "Camera initialization failed: %s", esp_err_to_name(err));
          return err;
      }
      ESP_LOGI(TAG, "Camera initialized successfully in PSRAM.");
      return ESP_OK;
  }
  ```

- [ ] **Step 4: 编写 Servo HAL 组件构建文件**
  
  写入 `esp32-client/components/servo_hal/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "servo_hal.c"
                         INCLUDE_DIRS "include"
                         REQUIRES driver)
  ```

- [ ] **Step 5: 创建 Servo HAL 头文件声明**
  
  写入 `esp32-client/components/servo_hal/include/servo_hal.h`：
  ```c
  #ifndef _SERVO_HAL_H_
  #define _SERVO_HAL_H_

  #include "esp_err.h"

  esp_err_t app_servo_init(void);
  void app_servo_set_angle(int pan_angle, int tilt_angle);

  #endif
  ```

- [ ] **Step 6: 编写 50Hz/14位分辨率 LEDC 舵机驱动逻辑**
  
  写入 `esp32-client/components/servo_hal/servo_hal.c`：
  ```c
  #include "driver/ledc.h"
  #include "esp_log.h"
  #include "servo_hal.h"
  #include "config.h"

  #define LEDC_SPEED_MODE      LEDC_LOW_SPEED_MODE
  #define LEDC_TIMER           LEDC_TIMER_1
  #define LEDC_RESOLUTION      LEDC_TIMER_14_BIT
  #define LEDC_FREQ_HZ         50

  static const char *TAG = "SERVO_HAL";

  static uint32_t angle_to_duty(int angle) {
      if (angle < 0) angle = 0;
      if (angle > 180) angle = 180;
      return 410 + (uint32_t)((double)angle * (2048 - 410) / 180.0);
  }

  esp_err_t app_servo_init(void) {
      ledc_timer_config_t ledc_timer = {
          .speed_mode       = LEDC_SPEED_MODE,
          .timer_num        = LEDC_TIMER,
          .duty_resolution  = LEDC_RESOLUTION,
          .freq_hz          = LEDC_FREQ_HZ,
          .clk_cfg          = LEDC_AUTO_CLK
      };
      ESP_ERROR_CHECK(ledc_timer_config(&ledc_timer));

      ledc_channel_config_t pan_channel = {
          .speed_mode     = LEDC_SPEED_MODE,
          .channel        = LEDC_CHANNEL_1,
          .timer_sel      = LEDC_TIMER,
          .intr_type      = LEDC_INTR_DISABLE,
          .gpio_num       = SERVO_PAN_PIN,
          .duty           = angle_to_duty(90), // 初始居中 90 度
          .hpoint         = 0
      };
      ESP_ERROR_CHECK(ledc_channel_config(&pan_channel));

      ledc_channel_config_t tilt_channel = {
          .speed_mode     = LEDC_SPEED_MODE,
          .channel        = LEDC_CHANNEL_2,
          .timer_sel      = LEDC_TIMER,
          .intr_type      = LEDC_INTR_DISABLE,
          .gpio_num       = SERVO_TILT_PIN,
          .duty           = angle_to_duty(90), // 初始居中 90 度
          .hpoint         = 0
      };
      ESP_ERROR_CHECK(ledc_channel_config(&tilt_channel));

      ESP_LOGI(TAG, "Pan/Tilt servos initialized (Pan: GPIO %d, Tilt: GPIO %d)", SERVO_PAN_PIN, SERVO_TILT_PIN);
      return ESP_OK;
  }

  void app_servo_set_angle(int pan_angle, int tilt_angle) {
      if (pan_angle >= 0 && pan_angle <= 180) {
          ledc_set_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_1, angle_to_duty(pan_angle));
          ledc_update_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_1);
      }
      if (tilt_angle >= 0 && tilt_angle <= 180) {
          ledc_set_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_2, angle_to_duty(tilt_angle));
          ledc_update_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_2);
      }
      ESP_LOGI(TAG, "Servo rotated: Pan: %d, Tilt: %d", pan_angle, tilt_angle);
  }
  ```

- [ ] **Step 7: 注册驱动并进行启动初始化**
  
  修改 `esp32-client/main/main.c`：
  ```c
  #include <stdio.h>
  #include "nvs_flash.h"
  #include "esp_log.h"
  #include "wifi_manager.h"
  #include "camera_hal.h" // 引入摄像头 HAL
  #include "servo_hal.h"  // 引入舵机 HAL

  void app_main(void) {
      ESP_LOGI("MAIN", "HomeGuard-RTC Camera Client Booting...");
      
      esp_err_t ret = nvs_flash_init();
      if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
          ESP_ERROR_CHECK(nvs_flash_erase());
          ret = nvs_flash_init();
      }
      ESP_ERROR_CHECK(ret);
      ESP_LOGI("MAIN", "NVS Storage Initialized Successfully.");

      // 初始化摄像头与舵机驱动
      ESP_ERROR_CHECK(app_camera_init());
      ESP_ERROR_CHECK(app_servo_init());

      // 启动 WiFi 管理器
      ESP_ERROR_CHECK(app_wifi_init());
  }
  ```

- [ ] **Step 8: 物理编译验证**
  
  在 `esp32-client/` 下执行：
  `idf.py -p com8 flash monitor`
  验证：观察串口日志。应该成功打印 `Camera initialized successfully in PSRAM.` 和 `Pan/Tilt servos initialized (Pan: GPIO 1, Tilt: GPIO 2)`。

- [ ] **Step 9: Commit**
  
  ```bash
  git add esp32-client/components/camera_hal/ esp32-client/components/servo_hal/ esp32-client/main/main.c
  git commit -m "feat(esp32): implement camera_hal with SPIRAM binding and LEDC servo_hal"
  ```

---

### Task 4: WebSocket 双向信令长连接与策略指令路由分发 (control_plane)

**Files:**
- Create: `esp32-client/components/control_plane/CMakeLists.txt`
- Create: `esp32-client/components/control_plane/include/control_plane.h`
- Create: `esp32-client/components/control_plane/control_dispatch.c`
- Create: `esp32-client/components/control_plane/control_ws.c`
- Modify: `esp32-client/main/main.c`

- [ ] **Step 1: 编写 Control Plane 组件构建脚本**
  
  写入 `esp32-client/components/control_plane/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "control_dispatch.c" "control_ws.c"
                         INCLUDE_DIRS "include"
                         REQUIRES esp_websocket_client cjson servo_hal wifi_manager)
  ```

- [ ] **Step 2: 声明信令头文件 API**
  
  写入 `esp32-client/components/control_plane/include/control_plane.h`：
  ```c
  #ifndef _CONTROL_PLANE_H_
  #define _CONTROL_PLANE_H_

  #include "cJSON.h"

  void app_control_plane_connect(void);
  void app_control_plane_dispatch(const char *action, const cJSON *payload);
  void app_control_plane_report_status(void);

  #endif
  ```

- [ ] **Step 3: 采用策略模式编写零 if-else 分发器**
  
  写入 `esp32-client/components/control_plane/control_dispatch.c`，将收到的命令完美映射给具体的回调方法：
  ```c
  #include <string.h>
  #include "esp_log.h"
  #include "esp_system.h"
  #include "control_plane.h"
  #include "servo_hal.h"

  static const char *TAG = "CTRL_DISPATCH";

  typedef void (*command_handler_t)(const cJSON *payload);

  static void handle_ptz_move(const cJSON *payload) {
      cJSON *pan = cJSON_GetObjectItem(payload, "pan");
      cJSON *tilt = cJSON_GetObjectItem(payload, "tilt");
      if (pan && tilt) {
          app_servo_set_angle(pan->valueint, tilt->valueint);
      }
  }

  static void handle_reboot(const cJSON *payload) {
      ESP_LOGW(TAG, "Reboot command received, restarting system in 1s...");
      vTaskDelay(pdMS_TO_TICKS(1000));
      esp_restart();
  }

  static void handle_status_query(const cJSON *payload) {
      ESP_LOGI(TAG, "Executing on-demand status report query.");
      app_control_plane_report_status();
  }

  typedef struct {
      const char *cmd_name;
      command_handler_t handler;
  } command_route_t;

  static const command_route_t cmd_routing_table[] = {
      {"ptz",          handle_ptz_move},
      {"reboot",       handle_reboot},
      {"status_query", handle_status_query},
  };

  void app_control_plane_dispatch(const char *action, const cJSON *payload) {
      size_t table_size = sizeof(cmd_routing_table) / sizeof(command_route_t);
      for (size_t i = 0; i < table_size; i++) {
          if (strcmp(action, cmd_routing_table[i].cmd_name) == 0) {
              cmd_routing_table[i].handler(payload);
              return;
          }
      }
      ESP_LOGW(TAG, "Received unregistered command action: %s", action);
  }
  ```

- [ ] **Step 4: 编写 WebSocket 管理器与实时心跳发送逻辑**
  
  写入 `esp32-client/components/control_plane/control_ws.c`，在 Core 1 维持长连接，开启自签名免证书校验：
  ```c
  #include <stdio.h>
  #include <string.h>
  #include "esp_websocket_client.h"
  #include "esp_log.h"
  #include "control_plane.h"
  #include "config.h"

  static const char *TAG = "CTRL_WS";
  static esp_websocket_client_handle_t ws_client = NULL;

  static void ws_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
      esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
      switch (event_id) {
          case WEBSOCKET_EVENT_CONNECTED:
              ESP_LOGI(TAG, "Signaling WebSocket established successfully!");
              app_control_plane_report_status();
              break;
          case WEBSOCKET_EVENT_DISCONNECTED:
              ESP_LOGW(TAG, "Signaling WebSocket disconnected.");
              break;
          case WEBSOCKET_EVENT_DATA:
              if (data->op_code == WS_TRANSPORT_OPCODES_TEXT && data->data_len > 0) {
                  ESP_LOGI(TAG, "Received message payload: %.*s", data->data_len, (char *)data->data_ptr);
                  cJSON *root = cJSON_ParseWithLength(data->data_ptr, data->data_len);
                  if (root) {
                      cJSON *type = cJSON_GetObjectItem(root, "type");
                      cJSON *action = cJSON_GetObjectItem(root, "action");
                      cJSON *payload = cJSON_GetObjectItem(root, "payload");
                      
                      if (type && strcmp(type->valuestring, "command") == 0 && action) {
                          app_control_plane_dispatch(action->valuestring, payload);
                      }
                      cJSON_Delete(root);
                  }
              }
              break;
          case WEBSOCKET_EVENT_ERROR:
              ESP_LOGE(TAG, "WebSocket error event triggered");
              break;
      }
  }

  void app_control_plane_connect(void) {
      char ws_uri[256];
      snprintf(ws_uri, sizeof(ws_uri), "wss://%s:%d/control?role=device&deviceId=%s&token=%s",
               DOMAIN_APP, SERVER_PORT, DEVICE_ID, DEVICE_SECRET);

      esp_websocket_client_config_t config = {
          .uri = ws_uri,
          .network_timeout_ms = 5000,
          .skip_cert_common_name_check = true, // Bypass TLS Certificate
          .crt_bundle_attach = NULL
      };

      ESP_LOGI(TAG, "Initiating WebSocket connection to: %s", ws_uri);
      ws_client = esp_websocket_client_init(&config);
      esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
      
      // 启动长连接
      esp_websocket_client_start(ws_client);
  }

  void app_control_plane_report_status(void) {
      if (!ws_client || !esp_websocket_client_is_connected(ws_client)) return;

      cJSON *root = cJSON_CreateObject();
      cJSON_AddStringToObject(root, "type", "status_report");
      
      cJSON *payload = cJSON_CreateObject();
      cJSON_AddNumberToObject(payload, "uptime", esp_log_timestamp() / 1000);
      cJSON_AddNumberToObject(payload, "free_heap", esp_get_free_heap_size());
      cJSON_AddStringToObject(payload, "firmware", "v1.0.0-Beta");
      cJSON_AddItemToObject(root, "payload", payload);

      char *json_str = cJSON_PrintUnformatted(root);
      if (json_str) {
          esp_websocket_client_send_text(ws_client, json_str, strlen(json_str), portMAX_DELAY);
          free(json_str);
      }
      cJSON_Delete(root);
  }
  ```

- [ ] **Step 5: 绑定 WiFi 连接就绪事件以激活 WebSocket**
  
  修改 `esp32-client/main/main.c`，监听 `APP_EVENT_NETWORK_CONNECTED` 事件后自动创建 Core 1 信令任务：
  ```c
  #include <stdio.h>
  #include "nvs_flash.h"
  #include "esp_log.h"
  #include "wifi_manager.h"
  #include "camera_hal.h"
  #include "servo_hal.h"
  #include "control_plane.h" // 引入控制面

  static void on_network_connected(void* arg, esp_event_base_t base, int32_t id, void* data) {
      ESP_LOGI("MAIN", "Network Connected Event Received. Initiating control plane task...");
      // 创建连接 (内部会自动建立 WebSocket 线程运行在 Core 1)
      app_control_plane_connect();
  }

  void app_main(void) {
      ESP_LOGI("MAIN", "HomeGuard-RTC Camera Client Booting...");
      
      esp_err_t ret = nvs_flash_init();
      if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
          ESP_ERROR_CHECK(nvs_flash_erase());
          ret = nvs_flash_init();
      }
      ESP_ERROR_CHECK(ret);
      ESP_LOGI("MAIN", "NVS Storage Initialized Successfully.");

      ESP_ERROR_CHECK(app_camera_init());
      ESP_ERROR_CHECK(app_servo_init());

      // 注册网络连接监听事件
      ESP_ERROR_CHECK(esp_event_handler_register(APP_EVENT, APP_EVENT_NETWORK_CONNECTED, &on_network_connected, NULL));

      ESP_ERROR_CHECK(app_wifi_init());
  }
  ```

- [ ] **Step 6: 本地与 Node.js 长连接及控制指令联调测试**
  
  1. 确认 Node.js 开发端运行：`pnpm --prefix nitro-app run dev`（监听在 `3000`）。
  2. 确认 Docker Nginx 网关在 `192.168.1.9:443` 正常启动运行。
  3. 在 `esp32-client/` 执行：`idf.py -p com8 flash monitor`。
  4. 验证：串口日志中显示 `Signaling WebSocket established successfully!`，同时 Node.js 终端输出 `[WS] Device camera_home connected and marked online.`，代表双向信令全部打通！

- [ ] **Step 7: Commit**
  
  ```bash
  git add esp32-client/components/control_plane/ esp32-client/main/main.c
  git commit -m "feat(esp32): add WebSocket control plane signaling and Strategy Pattern dispatching"
  ```

---

### Task 5: W3C WHIP 协议 WebRTC over TCP 视频推流 (whip_client)

**Files:**
- Create: `esp32-client/components/whip_client/CMakeLists.txt`
- Create: `esp32-client/components/whip_client/include/whip_client.h`
- Create: `esp32-client/components/whip_client/whip_negotiator.c`
- Create: `esp32-client/components/whip_client/whip_streamer.c`
- Modify: `esp32-client/main/main.c`

- [ ] **Step 1: 编写 WHIP 客户端组件构建构建文件**
  
  写入 `esp32-client/components/whip_client/CMakeLists.txt`：
  ```cmake
  idf_component_register(SRCS "whip_negotiator.c" "whip_streamer.c"
                         INCLUDE_DIRS "include"
                         REQUIRES esp_http_client esp-webrtc-solution camera_hal wifi_manager)
  ```

- [ ] **Step 2: 声明 WHIP 协议 API**
  
  写入 `esp32-client/components/whip_client/include/whip_client.h`：
  ```c
  #ifndef _WHIP_CLIENT_H_
  #define _WHIP_CLIENT_H_

  #include "esp_err.h"

  esp_err_t app_whip_negotiate(char *answer_sdp_out, size_t max_len);
  void app_whip_stream_start(void);

  #endif
  ```

- [ ] **Step 3: 实现 Token 动态申请与 SDP POST 协商逻辑**
  
  写入 `esp32-client/components/whip_client/whip_negotiator.c`，使用双 HTTPS 物理握手解析：
  ```c
  #include <stdio.h>
  #include <string.h>
  #include "esp_http_client.h"
  #include "esp_log.h"
  #include "cJSON.h"
  #include "esp_webrtc.h"
  #include "whip_client.h"
  #include "config.h"

  static const char *TAG = "WHIP_NEG";

  static esp_err_t fetch_publish_token(char *token_out, size_t max_len) {
      char post_data[256];
      snprintf(post_data, sizeof(post_data),
               "{\"deviceId\":\"%s\",\"secret\":\"%s\",\"app\":\"live\",\"stream\":\"%s\"}",
               DEVICE_ID, DEVICE_SECRET, "live", DEVICE_ID);

      char url[256];
      snprintf(url, sizeof(url), "https://%s:%d/api/devices/publish-token", DOMAIN_APP, SERVER_PORT);

      esp_http_client_config_t config = {
          .url = url,
          .method = HTTP_METHOD_POST,
          .skip_cert_common_name_check = true, // Bypass SSL Verification
          .transport_type = HTTP_TRANSPORT_OVER_SSL,
      };

      esp_http_client_handle_t client = esp_http_client_init(&config);
      esp_http_client_set_header(client, "Content-Type", "application/json");
      esp_http_client_set_post_field(client, post_data, strlen(post_data));

      esp_err_t err = esp_http_client_perform(client);
      if (err == ESP_OK) {
          int status_code = esp_http_client_get_status_code(client);
          if (status_code == 200) {
              char response[512];
              int len = esp_http_client_read_response(client, response, sizeof(response) - 1);
              if (len > 0) {
                  response[len] = '\0';
                  cJSON *root = cJSON_Parse(response);
                  if (root) {
                      cJSON *token = cJSON_GetObjectItem(root, "token");
                      if (token) {
                          strncpy(token_out, token->valuestring, max_len);
                          err = ESP_OK;
                      }
                      cJSON_Delete(root);
                  }
              }
          } else {
              ESP_LOGE(TAG, "Failed to fetch token. HTTP Status Code: %d", status_code);
              err = ESP_FAIL;
          }
      }
      esp_http_client_cleanup(client);
      return err;
  }

  esp_err_t app_whip_negotiate(char *answer_sdp_out, size_t max_len) {
      char token[256];
      if (fetch_publish_token(token, sizeof(token)) != ESP_OK) {
          return ESP_FAIL;
      }

      // 获取 esp-webrtc-solution 生成的 Local Offer SDP
      const char *local_offer_sdp = esp_webrtc_generate_offer(); 

      char whip_url[512];
      snprintf(whip_url, sizeof(whip_url), "https://%s:%d/rtc/v1/whip/?app=live&stream=%s&token=%s",
               DOMAIN_MEDIA, SERVER_PORT, DEVICE_ID, token);

      esp_http_client_config_t config = {
          .url = whip_url,
          .method = HTTP_METHOD_POST,
          .skip_cert_common_name_check = true, // Bypass SSL Verification
          .transport_type = HTTP_TRANSPORT_OVER_SSL,
      };

      ESP_LOGI(TAG, "Sending WHIP Offer SDP to SRS: %s", whip_url);
      esp_http_client_handle_t client = esp_http_client_init(&config);
      esp_http_client_set_header(client, "Content-Type", "application/sdp");
      esp_http_client_set_post_field(client, local_offer_sdp, strlen(local_offer_sdp));

      esp_err_t err = esp_http_client_perform(client);
      if (err == ESP_OK) {
          int status_code = esp_http_client_get_status_code(client);
          if (status_code == 201) { // 201 Created 代表 WHIP 建立成功
              int len = esp_http_client_read_response(client, answer_sdp_out, max_len - 1);
              answer_sdp_out[len] = '\0';
              ESP_LOGI(TAG, "WHIP Negotiation Successful!");
          } else {
              ESP_LOGE(TAG, "WHIP Request Failed. HTTP Status Code: %d", status_code);
              err = ESP_FAIL;
          }
      }
      esp_http_client_cleanup(client);
      return err;
  }
  ```

- [ ] **Step 4: 编写 Core 0 高优先流媒体推送循环任务**
  
  写入 `esp32-client/components/whip_client/whip_streamer.c`，使用高帧率捕获与防泄露内存安全帧归还处理：
  ```c
  #include "freertos/FreeRTOS.h"
  #include "freertos/task.h"
  #include "esp_camera.h"
  #include "esp_webrtc.h"
  #include "esp_log.h"
  #include "whip_client.h"

  static const char *TAG = "WHIP_STREAMER";

  static void whip_stream_task(void *pvParameters) {
      ESP_LOGI(TAG, "WHIP streaming loop activated on Core %d", xPortGetCoreID());

      while (1) {
          // 1. 获取最新一帧数据
          camera_fb_t *fb = esp_camera_fb_get();
          if (!fb) {
              ESP_LOGW(TAG, "Camera buffer frame capture timed out");
              vTaskDelay(pdMS_TO_TICKS(10));
              continue;
          }

          // 2. 发送音视频 RTP 包至 WebRTC over TCP 通道
          esp_err_t err = esp_webrtc_send_video_frame(fb->buf, fb->len);
          if (err != ESP_OK) {
              ESP_LOGE(TAG, "Failed to send WebRTC RTP frame: %s", esp_err_to_name(err));
          }

          // 3. 必须立即释放缓冲归还给 HAL 双层池，绝对防范内存泄露
          esp_camera_fb_return(fb);

          // 4. 控制 30FPS 流速限率
          vTaskDelay(pdMS_TO_TICKS(33));
      }
      vTaskDelete(NULL);
  }

  void app_whip_stream_start(void) {
      static char answer_sdp[2048];
      
      ESP_LOGI(TAG, "Starting WHIP WebRTC flow negotiation...");
      if (app_whip_negotiate(answer_sdp, sizeof(answer_sdp)) == ESP_OK) {
          // 初始化底层 ICE 并填入 Answer sdp
          esp_webrtc_start_peer_connection(answer_sdp);

          // 创建独立的媒体发送任务运行在 Core 0
          xTaskCreatePinnedToCore(whip_stream_task,
                                 "whip_stream_task",
                                 16384,
                                 NULL,
                                 6, // 优先级设为 6，略高于 WebSocket 任务
                                 NULL,
                                 0); // 运行在 Core 0 上
          ESP_LOGI(TAG, "WHIP WebRTC Media Streaming loop running.");
      } else {
          ESP_LOGE(TAG, "Failed to start WHIP Streaming due to failed negotiation.");
      }
  }
  ```

- [ ] **Step 5: 开启网络连接后自动 WHIP 推流**
  
  修改 `esp32-client/main/main.c`，在 WiFi 连网成功后，伴随 WebSocket，自动启动 WebRTC 媒体推流：
  ```c
  #include <stdio.h>
  #include "nvs_flash.h"
  #include "esp_log.h"
  #include "wifi_manager.h"
  #include "camera_hal.h"
  #include "servo_hal.h"
  #include "control_plane.h"
  #include "whip_client.h" // 引入 WHIP 推流

  static void on_network_connected(void* arg, esp_event_base_t base, int32_t id, void* data) {
      ESP_LOGI("MAIN", "Network Connected Event Received. Initiating control and media streams...");
      
      // 1. 建立控制通道 WebSocket (Core 1)
      app_control_plane_connect();

      // 2. 建立 WHIP WebRTC 媒体通道推流 (Core 0)
      app_whip_stream_start();
  }

  void app_main(void) {
      ESP_LOGI("MAIN", "HomeGuard-RTC Camera Client Booting...");
      
      esp_err_t ret = nvs_flash_init();
      if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
          ESP_ERROR_CHECK(nvs_flash_erase());
          ret = nvs_flash_init();
      }
      ESP_ERROR_CHECK(ret);
      ESP_LOGI("MAIN", "NVS Storage Initialized Successfully.");

      ESP_ERROR_CHECK(app_camera_init());
      ESP_ERROR_CHECK(app_servo_init());

      ESP_ERROR_CHECK(esp_event_handler_register(APP_EVENT, APP_EVENT_NETWORK_CONNECTED, &on_network_connected, NULL));

      ESP_ERROR_CHECK(app_wifi_init());
  }
  ```

- [ ] **Step 6: 双向控制面与音视频推流整体端到端闭环物理验证**
  
  1. 确保 Docker（Nginx、SRS）和 Node.js 后端全线绿灯正常工作。
  2. 在 `esp32-client/` 执行编译烧录：`idf.py -p com8 flash monitor`。
  3. 验证串口日志：
     - `DNS: Successfully mapped...`
     - `Signaling WebSocket established successfully!`
     - `WHIP Negotiation Successful!`
     - `WHIP streaming loop activated on Core 0`
  4. 打开浏览器，通过 WHEP 客户端接入流：
     `https://media.local.test/rtc/v1/whep/?app=live&stream=camera_home&token=<Token>`
     确认视频流畅度，且设备没有发生重启崩溃（Crash Loop）。

- [ ] **Step 7: Commit**
  
  ```bash
  git add esp32-client/components/whip_client/ esp32-client/main/main.c
  git commit -m "feat(esp32): implement WHIP client negotiation and high speed WebRTC stream task"
  ```
