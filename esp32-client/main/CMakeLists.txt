idf_component_register(SRCS "main.c"
                       INCLUDE_DIRS "."
                       REQUIRES wifi_manager camera_hal servo_hal control_plane whip_client)
