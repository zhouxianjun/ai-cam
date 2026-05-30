#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include "servo_hal.h"
#include "config.h"

#define LEDC_SPEED_MODE      LEDC_LOW_SPEED_MODE
#define LEDC_TIMER           LEDC_TIMER_1
#define LEDC_RESOLUTION      LEDC_TIMER_14_BIT
#define LEDC_FREQ_HZ         50

static const char *TAG = "SERVO_HAL";
static SemaphoreHandle_t s_servo_mutex = NULL;

static uint32_t angle_to_duty(int angle) {
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;
    return 410 + (uint32_t)angle * 1638u / 180u;
}

esp_err_t app_servo_init(void) {
    if (s_servo_mutex == NULL) {
        s_servo_mutex = xSemaphoreCreateMutex();
        if (s_servo_mutex == NULL) {
            ESP_LOGE(TAG, "Failed to create servo mutex");
            return ESP_ERR_NO_MEM;
        }
    }

    ledc_timer_config_t ledc_timer = {
        .speed_mode       = LEDC_SPEED_MODE,
        .timer_num        = LEDC_TIMER,
        .duty_resolution  = LEDC_RESOLUTION,
        .freq_hz          = LEDC_FREQ_HZ,
        .clk_cfg          = LEDC_USE_APB_CLK,
    };
    esp_err_t err = ledc_timer_config(&ledc_timer);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "LEDC timer config failed: %s", esp_err_to_name(err));
        return err;
    }

    ledc_channel_config_t pan_channel = {
        .speed_mode     = LEDC_SPEED_MODE,
        .channel        = LEDC_CHANNEL_1,
        .timer_sel      = LEDC_TIMER,
        .intr_type      = LEDC_INTR_DISABLE,
        .gpio_num       = SERVO_PAN_PIN,
        .duty           = angle_to_duty(90),
        .hpoint         = 0,
    };
    err = ledc_channel_config(&pan_channel);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Pan channel config failed: %s", esp_err_to_name(err));
        return err;
    }

    ledc_channel_config_t tilt_channel = {
        .speed_mode     = LEDC_SPEED_MODE,
        .channel        = LEDC_CHANNEL_2,
        .timer_sel      = LEDC_TIMER,
        .intr_type      = LEDC_INTR_DISABLE,
        .gpio_num       = SERVO_TILT_PIN,
        .duty           = angle_to_duty(90),
        .hpoint         = 0,
    };
    err = ledc_channel_config(&tilt_channel);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Tilt channel config failed: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "Pan/Tilt servos initialized (Pan: GPIO %d, Tilt: GPIO %d)", SERVO_PAN_PIN, SERVO_TILT_PIN);
    return ESP_OK;
}

esp_err_t app_servo_set_angle(int pan_angle, int tilt_angle) {
    if (s_servo_mutex == NULL) {
        ESP_LOGE(TAG, "Servo HAL not initialized");
        return ESP_ERR_INVALID_STATE;
    }

    if (xSemaphoreTake(s_servo_mutex, pdMS_TO_TICKS(100)) != pdTRUE) {
        ESP_LOGW(TAG, "Servo mutex timeout");
        return ESP_ERR_TIMEOUT;
    }

    esp_err_t err = ESP_OK;
    if (pan_angle >= 0 && pan_angle <= 180) {
        err = ledc_set_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_1, angle_to_duty(pan_angle));
        if (err == ESP_OK) {
            err = ledc_update_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_1);
        }
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to set pan duty: %s", esp_err_to_name(err));
            xSemaphoreGive(s_servo_mutex);
            return err;
        }
    }
    if (tilt_angle >= 0 && tilt_angle <= 180) {
        err = ledc_set_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_2, angle_to_duty(tilt_angle));
        if (err == ESP_OK) {
            err = ledc_update_duty(LEDC_SPEED_MODE, LEDC_CHANNEL_2);
        }
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to set tilt duty: %s", esp_err_to_name(err));
            xSemaphoreGive(s_servo_mutex);
            return err;
        }
    }

    xSemaphoreGive(s_servo_mutex);
    ESP_LOGI(TAG, "Servo rotated: Pan: %d, Tilt: %d", pan_angle, tilt_angle);
    return ESP_OK;
}
