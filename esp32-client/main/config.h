#ifndef APP_CONFIG_H_
#define APP_CONFIG_H_

#define WIFI_SSID           "LigaAI-CS-Office-2.4G"
#define WIFI_PASS           "LigaAI8888603"
#define RETRY_BACKOFF_MAX   30

#define LOCAL_SERVER_IP     "192.168.1.9"
#define DOMAIN_APP          "app.local.test"
#define DOMAIN_MEDIA        "media.local.test"
#define SERVER_PORT         443

#define DEVICE_ID           "camera_home"
#define DEVICE_SECRET       "device_secret_123456"

#define CAM_PWDN_GPIO      -1
#define CAM_RESET_GPIO     -1
#define CAM_XCLK_GPIO      15
#define CAM_SIOD_GPIO       4
#define CAM_SIOC_GPIO       5
#define CAM_Y9_GPIO        16
#define CAM_Y8_GPIO        17
#define CAM_Y7_GPIO        18
#define CAM_Y6_GPIO        12
#define CAM_Y5_GPIO        10
#define CAM_Y4_GPIO         8
#define CAM_Y3_GPIO         9
#define CAM_Y2_GPIO        11
#define CAM_VSYNC_GPIO      6
#define CAM_HREF_GPIO       7
#define CAM_PCLK_GPIO      13

#define CAM_XCLK_FREQ      8000000
#define CAM_FRAME_SIZE     FRAMESIZE_QVGA
#define CAM_JPEG_QUALITY   20

#define SERVO_PAN_PIN      1
#define SERVO_TILT_PIN     2

#endif // APP_CONFIG_H_
