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
        .pin_sccb_sda = CAM_SIOD_GPIO,
        .pin_sccb_scl = CAM_SIOC_GPIO,

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
        .fb_location = CAMERA_FB_IN_PSRAM,
    };

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera initialization failed: %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "Camera initialized successfully in PSRAM.");
    return ESP_OK;
}
