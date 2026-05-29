#ifndef _CONTROL_PLANE_H_
#define _CONTROL_PLANE_H_

#include "cJSON.h"

#ifdef __cplusplus
extern "C" {
#endif

void app_control_plane_connect(void);
void app_control_plane_dispatch(const char *action, const cJSON *payload);
void app_control_plane_report_status(void);

#ifdef __cplusplus
}
#endif

#endif // _CONTROL_PLANE_H_
