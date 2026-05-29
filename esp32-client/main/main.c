#include <stdio.h>
#include "nvs_flash.h"
#include "esp_log.h"
#include "wifi_manager.h"
#include "camera_hal.h"
#include "servo_hal.h"

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

    // 初始化摄像头与舵机驱动
    ESP_ERROR_CHECK(app_camera_init());
    ESP_ERROR_CHECK(app_servo_init());

    // 启动 WiFi 管理器
    ESP_ERROR_CHECK(app_wifi_init());
}

