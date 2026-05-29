idf_component_register(SRCS "control_dispatch.c" "control_ws.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_websocket_client cjson servo_hal wifi_manager)
