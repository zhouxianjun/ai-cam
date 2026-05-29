#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_system.h"

#include "esp_camera.h"
#include "esp_peer_default.h"
#include "whip_client.h"
#include "camera_hal.h"
#include "config.h"

static const char *TAG = "WHIP_STREAMER";

// Functions implemented in whip_negotiator.c
esp_err_t app_whip_fetch_token(char *token_out, size_t max_len);
esp_err_t app_whip_post_sdp(const char *local_offer_sdp, const char *token, char *answer_sdp_out, size_t max_len);

static esp_peer_handle_t whip_peer = NULL;
static bool peer_connected = false;
static bool peer_running = false;
static QueueHandle_t sdp_offer_queue = NULL;

static int peer_state_handler(esp_peer_state_t state, void *ctx) {
    ESP_LOGI(TAG, "WebRTC Peer State Transition: %d", state);
    if (state == ESP_PEER_STATE_CONNECTED) {
        ESP_LOGI(TAG, "WebRTC Channel Connected! Ready to stream.");
        peer_connected = true;
    } else if (state == ESP_PEER_STATE_DISCONNECTED || state == ESP_PEER_STATE_CLOSED) {
        ESP_LOGW(TAG, "WebRTC Channel Disconnected / Closed.");
        peer_connected = false;
    }
    return 0;
}

static int peer_msg_handler(esp_peer_msg_t *msg, void *ctx) {
    if (msg->type == ESP_PEER_MSG_TYPE_SDP) {
        ESP_LOGI(TAG, "Local SDP Offer generated. Forwarding to negotiator...");
        char *offer_sdp = malloc(msg->size + 1);
        if (offer_sdp) {
            memcpy(offer_sdp, msg->data, msg->size);
            offer_sdp[msg->size] = '\0';
            if (xQueueSend(sdp_offer_queue, &offer_sdp, portMAX_DELAY) != pdPASS) {
                free(offer_sdp);
            }
        }
    }
    return 0;
}

// Background negotiation task that receives SDP Offer, posts to SRS, and pushes SDP Answer
static void whip_negotiation_task(void *arg) {
    char *offer_sdp = NULL;
    char token[256];
    static char answer_sdp[2048];

    while (peer_running) {
        if (xQueueReceive(sdp_offer_queue, &offer_sdp, pdMS_TO_TICKS(100)) == pdPASS && offer_sdp) {
            ESP_LOGI(TAG, "Negotiator received local SDP Offer. Starting network handshakes...");
            
            // 1. Fetch publication token
            if (app_whip_fetch_token(token, sizeof(token)) == ESP_OK) {
                // 2. Perform WHIP POST to SRS
                if (app_whip_post_sdp(offer_sdp, token, answer_sdp, sizeof(answer_sdp)) == ESP_OK) {
                    // 3. Send the SDP Answer back to the esp_peer client
                    esp_peer_msg_t answer_msg = {
                        .type = ESP_PEER_MSG_TYPE_SDP,
                        .data = (uint8_t *)answer_sdp,
                        .size = strlen(answer_sdp)
                    };
                    ESP_LOGI(TAG, "Submitting SDP Answer back to WebRTC core...");
                    esp_peer_send_msg(whip_peer, &answer_msg);
                } else {
                    ESP_LOGE(TAG, "Failed to negotiate WHIP Offer/Answer with SRS");
                }
            } else {
                ESP_LOGE(TAG, "Failed to fetch device publication token");
            }
            free(offer_sdp);
            offer_sdp = NULL;
        }
    }
    vTaskDelete(NULL);
}

// Core WebRTC polling loop task
static void whip_pc_task(void *arg) {
    ESP_LOGI(TAG, "WebRTC Core Loop task active on Core %d", xPortGetCoreID());
    while (peer_running) {
        esp_peer_main_loop(whip_peer);
        vTaskDelay(pdMS_TO_TICKS(20)); // Small sleep to let FreeRTOS scheduler run
    }
    vTaskDelete(NULL);
}

// Core 0 video frame pushing loop
static void whip_stream_task(void *pvParameters) {
    ESP_LOGI(TAG, "WHIP high speed media streamer task started on Core %d", xPortGetCoreID());
    uint32_t frame_count = 0;

    while (peer_running) {
        if (!peer_connected) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // 1. Get latest frame from camera HAL
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            ESP_LOGW(TAG, "Camera frame capture timeout");
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }

        // 2. Formulate video frame struct for esp_peer
        esp_peer_video_frame_t frame = {
            .pts = frame_count++,
            .data = fb->buf,
            .size = fb->len
        };

        // 3. Pushes RTP packets over established WebRTC TCP channel
        int ret = esp_peer_send_video(whip_peer, &frame);
        if (ret != ESP_PEER_ERR_NONE) {
            ESP_LOGE(TAG, "Failed to send video frame via WebRTC: %d", ret);
        }

        // 4. Return the frame buffer to the camera HAL immediately
        esp_camera_fb_return(fb);

        // 5. Enforce 30 FPS limits
        vTaskDelay(pdMS_TO_TICKS(33));
    }
    vTaskDelete(NULL);
}

void app_whip_stream_start(void) {
    if (whip_peer != NULL) {
        ESP_LOGW(TAG, "WHIP stream already started");
        return;
    }

    ESP_LOGI(TAG, "Starting WHIP WebRTC client setup...");
    
    // 1. Generate DTLS credentials ahead of time
    esp_peer_pre_generate_cert();

    // 2. Formulate configuration profiles
    esp_peer_default_cfg_t peer_cfg = {
        .agent_recv_timeout = 150,
        .data_ch_cfg = {
            .recv_cache_size = 2048,
            .send_cache_size = 2048,
        },
        .rtp_cfg = {
            .send_pool_size = 800 * 1024, // Enlarge sending cache for MJPEG frames
            .send_queue_num = 128,
            .max_resend_count = 3
        }
    };

    esp_peer_cfg_t cfg = {
        .audio_dir = ESP_PEER_MEDIA_DIR_NONE,
        .video_dir = ESP_PEER_MEDIA_DIR_SEND_ONLY,
        .video_info = {
            .codec = ESP_PEER_VIDEO_CODEC_MJPEG,
            .width = 320,
            .height = 240,
            .fps = 30
        },
        .enable_data_channel = false,
        .role = ESP_PEER_ROLE_CONTROLLING, // Controlling role triggers SDP generation on connection
        .on_state = peer_state_handler,
        .on_msg = peer_msg_handler,
        .ctx = NULL,
        .extra_cfg = &peer_cfg,
        .extra_size = sizeof(esp_peer_default_cfg_t),
    };

    // 3. Open peer connection using default Espressif library implementation
    int ret = esp_peer_open(&cfg, esp_peer_get_default_impl(), &whip_peer);
    if (ret != ESP_PEER_ERR_NONE) {
        ESP_LOGE(TAG, "Failed to open WebRTC peer connection: %d", ret);
        return;
    }

    peer_running = true;
    sdp_offer_queue = xQueueCreate(2, sizeof(char *));

    // 4. Create non-blocking task structures
    // Polling ICE / SCTP stack loops on Core 1
    xTaskCreatePinnedToCore(whip_pc_task, "whip_pc_task", 8192, NULL, 5, NULL, 1);
    
    // Asynchronous network HTTP handshakes on Core 1
    xTaskCreatePinnedToCore(whip_negotiation_task, "whip_neg_task", 8192, NULL, 4, NULL, 1);
    
    // High performance frame streamer task running on Core 0
    xTaskCreatePinnedToCore(whip_stream_task, "whip_stream_task", 8192, NULL, 6, NULL, 0);

    // 5. Triggers WebRTC to start gathering ICE candidates and produce Offer SDP
    ESP_LOGI(TAG, "Initiating WebRTC connection flow...");
    esp_peer_new_connection(whip_peer);
}
