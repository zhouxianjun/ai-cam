#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_websocket_client.h"
#include "esp_log.h"
#include "esp_system.h"
#include "control_plane.h"
#include "config.h"

#include "root_ca.h"


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
                } else {
                    ESP_LOGE(TAG, "Failed to parse incoming JSON payload");
                }
            }
            break;
        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGE(TAG, "WebSocket error event triggered");
            break;
    }
}

static void control_ws_heartbeat_task(void *arg) {
    ESP_LOGI(TAG, "WebSocket periodic heartbeat telemetry task active.");
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(20000)); // Send status telemetry report every 20 seconds to keep connection alive
        app_control_plane_report_status();
    }
}

void app_control_plane_connect(void) {
    char ws_uri[256];
    snprintf(ws_uri, sizeof(ws_uri), "wss://%s:%d/control?role=device&deviceId=%s&token=%s",
             DOMAIN_APP, SERVER_PORT, DEVICE_ID, DEVICE_SECRET);

    esp_websocket_client_config_t config = {
        .uri = ws_uri,
        .network_timeout_ms = 5000,
        .skip_cert_common_name_check = false, // Enable CN check to ensure SNI is sent to Nginx stream mapping!
        .cert_pem = ROOT_CA_PEM,
        .crt_bundle_attach = NULL
    };



    ESP_LOGI(TAG, "Initiating WebSocket connection to: %s", ws_uri);
    ws_client = esp_websocket_client_init(&config);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);
    
    // Start long-connection client task (spawns under internal task running on Core 1 by default in ESP-IDF)
    esp_websocket_client_start(ws_client);

    // Create a low priority periodic telemetry heartbeat task on Core 1 to prevent Nginx 60s idle timeouts
    xTaskCreatePinnedToCore(control_ws_heartbeat_task, "ws_heartbeat", 4096, NULL, 3, NULL, 1);
}

void app_control_plane_report_status(void) {
    if (!ws_client || !esp_websocket_client_is_connected(ws_client)) {
        ESP_LOGW(TAG, "Cannot report status, WebSocket not connected");
        return;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "status_report");
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "uptime", esp_log_timestamp() / 1000);
    cJSON_AddNumberToObject(payload, "free_heap", esp_get_free_heap_size());
    cJSON_AddStringToObject(payload, "firmware", "v1.0.0-Beta");
    cJSON_AddItemToObject(root, "payload", payload);

    char *json_str = cJSON_PrintUnformatted(root);
    if (json_str) {
        int bytes_sent = esp_websocket_client_send_text(ws_client, json_str, strlen(json_str), portMAX_DELAY);
        if (bytes_sent < 0) {
            ESP_LOGE(TAG, "Failed to send status report via WebSocket");
        } else {
            ESP_LOGI(TAG, "Status report sent successfully (%d bytes)", bytes_sent);
        }
        free(json_str);
    }
    cJSON_Delete(root);
}
