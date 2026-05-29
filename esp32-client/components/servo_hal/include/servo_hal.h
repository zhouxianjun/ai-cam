#ifndef SERVO_HAL_H_
#define SERVO_HAL_H_

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t app_servo_init(void);
esp_err_t app_servo_set_angle(int pan_angle, int tilt_angle);

#ifdef __cplusplus
}
#endif

#endif // SERVO_HAL_H_
