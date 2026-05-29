idf_component_register(SRCS "servo_hal.c"
                       INCLUDE_DIRS "include" "../../main"
                       REQUIRES esp_driver_ledc)
