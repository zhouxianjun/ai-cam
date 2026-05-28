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
