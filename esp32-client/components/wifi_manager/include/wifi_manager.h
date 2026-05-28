#ifndef _WIFI_MANAGER_H_
#define _WIFI_MANAGER_H_

#include "esp_err.h"
#include "esp_event.h"

// 连网成功后向系统广播的 Event Loop 事件
ESP_EVENT_DECLARE_BASE(APP_EVENT);
enum {
    APP_EVENT_NETWORK_CONNECTED
};

esp_err_t app_wifi_init(void);

#endif
