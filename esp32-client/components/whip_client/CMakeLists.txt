idf_component_register(SRCS "whip_negotiator.c" "whip_streamer.c"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_http_client esp_peer camera_hal wifi_manager cjson)

