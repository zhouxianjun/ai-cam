#include <string.h>
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "control_plane.h"
#include "servo_hal.h"

static const char *TAG = "CTRL_DISPATCH";

typedef void (*command_handler_t)(const cJSON *payload);

static int s_current_pan = 90;
static int s_current_tilt = 90;

static void handle_ptz_move(const cJSON *payload) {
    cJSON *pan = cJSON_GetObjectItem(payload, "pan");
    cJSON *tilt = cJSON_GetObjectItem(payload, "tilt");
    cJSON *direction = cJSON_GetObjectItem(payload, "direction");
    cJSON *speed_item = cJSON_GetObjectItem(payload, "speed");

    if (pan && tilt) {
        s_current_pan = pan->valueint;
        s_current_tilt = tilt->valueint;
        
        // Bounds checking [0, 180]
        if (s_current_pan < 0) s_current_pan = 0;
        if (s_current_pan > 180) s_current_pan = 180;
        if (s_current_tilt < 0) s_current_tilt = 0;
        if (s_current_tilt > 180) s_current_tilt = 180;

        ESP_LOGI(TAG, "PTZ absolute move: target Pan=%d, Tilt=%d", s_current_pan, s_current_tilt);
        esp_err_t err = app_servo_set_angle(s_current_pan, s_current_tilt);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to set servo angle: %s", esp_err_to_name(err));
        }
    } else if (direction && direction->valuestring) {
        int speed = 5;
        if (speed_item) {
            speed = speed_item->valueint;
        }

        if (strcmp(direction->valuestring, "left") == 0) {
            s_current_pan -= speed;
        } else if (strcmp(direction->valuestring, "right") == 0) {
            s_current_pan += speed;
        } else if (strcmp(direction->valuestring, "up") == 0) {
            s_current_tilt += speed;
        } else if (strcmp(direction->valuestring, "down") == 0) {
            s_current_tilt -= speed;
        }

        // Bounds checking [0, 180]
        if (s_current_pan < 0) s_current_pan = 0;
        if (s_current_pan > 180) s_current_pan = 180;
        if (s_current_tilt < 0) s_current_tilt = 0;
        if (s_current_tilt > 180) s_current_tilt = 180;

        ESP_LOGI(TAG, "PTZ relative move: direction=%s, speed=%d -> target Pan=%d, Tilt=%d",
                 direction->valuestring, speed, s_current_pan, s_current_tilt);

        esp_err_t err = app_servo_set_angle(s_current_pan, s_current_tilt);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to set servo angle: %s", esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "PTZ command missing pan/tilt or direction properties");
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
