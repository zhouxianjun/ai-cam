#include <string.h>
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "control_plane.h"
#include "servo_hal.h"

static const char *TAG = "CTRL_DISPATCH";

typedef void (*command_handler_t)(const cJSON *payload);

static void handle_ptz_move(const cJSON *payload) {
    cJSON *pan = cJSON_GetObjectItem(payload, "pan");
    cJSON *tilt = cJSON_GetObjectItem(payload, "tilt");
    if (pan && tilt) {
        esp_err_t err = app_servo_set_angle(pan->valueint, tilt->valueint);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to set servo angle: %s", esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "PTZ command missing pan or tilt properties");
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
