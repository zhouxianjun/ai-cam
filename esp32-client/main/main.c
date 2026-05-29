#include <stdio.h>
#include "nvs_flash.h"
#include "esp_log.h"
#include "wifi_manager.h"
#include "camera_hal.h"
#include "servo_hal.h"
#include "control_plane.h"
#include "whip_client.h"

static const char *TAG = "MAIN";

static void on_network_connected(void* arg, esp_event_base_t base, int32_t id, void* data) {
    ESP_LOGI(TAG, "Network Connected Event Received. Initiating control plane and media stream...");
    // Initiate WebSocket signaling connection (Core 1)
    app_control_plane_connect();
    
    // Initiate W3C WHIP WebRTC over TCP media push connection (Core 0 / 1)
    app_whip_stream_start();
}


void app_main(void) {
    ESP_LOGI(TAG, "HomeGuard-RTC Camera Client Booting...");

    // 初始化非易失性存储 NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_LOGI(TAG, "NVS Storage Initialized Successfully.");

    // 初始化摄像头与舵机驱动
    ESP_ERROR_CHECK(app_camera_init());
    ESP_ERROR_CHECK(app_servo_init());

    // 启动 WiFi 管理器 (内部会创建默认 Event Loop)
    ESP_ERROR_CHECK(app_wifi_init());

    // 注册网络连接监听事件以激活控制面
    ESP_ERROR_CHECK(esp_event_handler_register(APP_EVENT, APP_EVENT_NETWORK_CONNECTED, &on_network_connected, NULL));
}

