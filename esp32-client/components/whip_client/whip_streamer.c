#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_heap_caps.h"

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
static volatile bool peer_connected = false;
static volatile bool peer_running = false;
static volatile bool connection_pending = false;
static QueueHandle_t sdp_offer_queue = NULL;
static QueueHandle_t sdp_answer_queue = NULL;

static volatile bool initial_delay_done = false;

static int peer_state_handler(esp_peer_state_t state, void *ctx) {
    ESP_LOGI(TAG, "WebRTC Peer State Transition: %d", state);
    if (state == ESP_PEER_STATE_CONNECTED) {
        ESP_LOGI(TAG, "WebRTC Channel Connected! Ready to stream.");
        peer_connected = true;
        connection_pending = false;
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

static int peer_video_info_handler(esp_peer_video_stream_info_t *info, void *ctx) {
    return 0;
}

static int peer_audio_info_handler(esp_peer_audio_stream_info_t *info, void *ctx) {
    return 0;
}

static int peer_video_data_handler(esp_peer_video_frame_t *frame, void *ctx) {
    return 0;
}

static int peer_audio_data_handler(esp_peer_audio_frame_t *frame, void *ctx) {
    return 0;
}

static int peer_data_handler(esp_peer_data_frame_t *frame, void *ctx) {
    return 0;
}

static int peer_channel_open_handler(esp_peer_data_channel_info_t *ch, void *ctx) {
    return 0;
}

static int peer_channel_close_handler(esp_peer_data_channel_info_t *ch, void *ctx) {
    return 0;
}

// Configuration profiles made static file-scoped so they are accessible on peer recreation
static esp_peer_default_cfg_t peer_cfg = {
    .agent_recv_timeout = 150,
    .data_ch_cfg = {
        .recv_cache_size = 4096,
        .send_cache_size = 4096,
    },
    .rtp_cfg = {
        .send_pool_size = 256 * 1024, // 256KB
        .send_queue_num = 64,
        .max_resend_count = 3
    }
};

static esp_peer_cfg_t cfg = {
    .audio_dir = ESP_PEER_MEDIA_DIR_NONE,
    .video_dir = ESP_PEER_MEDIA_DIR_SEND_ONLY,
    .video_info = {
        .codec = ESP_PEER_VIDEO_CODEC_H264,
        .width = 320,
        .height = 240,
        .fps = 30
    },
    .enable_data_channel = false,
    .role = ESP_PEER_ROLE_CONTROLLING,
    .on_state = peer_state_handler,
    .on_msg = peer_msg_handler,
    .on_video_info = peer_video_info_handler,
    .on_audio_info = peer_audio_info_handler,
    .on_video_data = peer_video_data_handler,
    .on_audio_data = peer_audio_data_handler,
    .on_channel_open = peer_channel_open_handler,
    .on_channel_close = peer_channel_close_handler,
    .on_data = peer_data_handler,
    .ctx = NULL,
    .extra_cfg = &peer_cfg,
    .extra_size = sizeof(esp_peer_default_cfg_t),
};

// Background negotiation task: receives SDP Offer, posts to SRS, pushes SDP Answer
static void whip_negotiation_task(void *arg) {
    char *offer_sdp = NULL;
    char token[256];

    while (peer_running) {
        if (xQueueReceive(sdp_offer_queue, &offer_sdp, pdMS_TO_TICKS(100)) == pdPASS && offer_sdp) {
            ESP_LOGI(TAG, "Negotiator received local SDP Offer. Starting network handshakes...");
            if (app_whip_fetch_token(token, sizeof(token)) == ESP_OK) {
                char *answer_sdp = malloc(2048);
                if (answer_sdp) {
                    if (app_whip_post_sdp(offer_sdp, token, answer_sdp, 2048) == ESP_OK) {
                        ESP_LOGI(TAG, "Queueing SDP Answer for whip_pc_task context...");
                        if (xQueueSend(sdp_answer_queue, &answer_sdp, portMAX_DELAY) != pdPASS) {
                            ESP_LOGE(TAG, "Failed to queue SDP Answer");
                            free(answer_sdp);
                        }
                    } else {
                        ESP_LOGE(TAG, "Failed to negotiate WHIP Offer/Answer with SRS");
                        free(answer_sdp);
                    }
                } else {
                    ESP_LOGE(TAG, "Failed to allocate memory for SDP Answer");
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

// Unified WebRTC polling + video streaming task.
// CRITICAL: esp_peer_main_loop() and esp_peer_send_video() share internal DTLS/SRTP
// state that is NOT thread-safe. They MUST execute in the same task context.
static void whip_pc_task(void *arg) {
    ESP_LOGI(TAG, "WebRTC unified task active on Core %d", xPortGetCoreID());
    uint32_t frame_count = 0;
    static bool initial_delay_done = false;
    TickType_t last_frame_tick = 0;
    const TickType_t frame_interval = pdMS_TO_TICKS(33); // ~30 fps
    connection_pending = true;
    TickType_t connection_start_tick = xTaskGetTickCount();

    while (peer_running) {
        // Process any queued SDP answer to keep all whip_peer interactions thread-safe
        char *answer_sdp_to_send = NULL;
        if (xQueueReceive(sdp_answer_queue, &answer_sdp_to_send, 0) == pdPASS) {
            if (answer_sdp_to_send) {
                esp_peer_msg_t answer_msg = {
                    .type = ESP_PEER_MSG_TYPE_SDP,
                    .data = (uint8_t *)answer_sdp_to_send,
                    .size = strlen(answer_sdp_to_send)
                };
                ESP_LOGI(TAG, "Submitting SDP Answer back to WebRTC core inside whip_pc_task context...");
                int ret = ESP_PEER_ERR_NONE;
                if (whip_peer) {
                    ret = esp_peer_send_msg(whip_peer, &answer_msg);
                } else {
                    ESP_LOGE(TAG, "whip_peer is NULL, cannot send SDP Answer");
                }
                if (ret != ESP_PEER_ERR_NONE) {
                    ESP_LOGE(TAG, "Failed to send SDP Answer message: %d", ret);
                }
                free(answer_sdp_to_send);
            }
        }

        // 1. Drive the WebRTC state machine (ICE, DTLS, SCTP, retransmission)
        if (whip_peer) {
            esp_peer_main_loop(whip_peer);
        }

        // WHIP retry: if connection was started but not connected within 30s, restart
        if (connection_pending && !peer_connected) {
            TickType_t now = xTaskGetTickCount();
            if (now - connection_start_tick > pdMS_TO_TICKS(30000)) {
                ESP_LOGW(TAG, "WHIP negotiation timeout, restarting connection flow cleanly...");
                
                // 1. Close current peer connection
                if (whip_peer) {
                    esp_peer_close(whip_peer);
                    whip_peer = NULL;
                }

                // 2. Drain and reset queues
                char *offer_to_free = NULL;
                while (xQueueReceive(sdp_offer_queue, &offer_to_free, 0) == pdPASS) {
                    if (offer_to_free) {
                        free(offer_to_free);
                    }
                }
                xQueueReset(sdp_offer_queue);

                char *answer_to_free = NULL;
                while (xQueueReceive(sdp_answer_queue, &answer_to_free, 0) == pdPASS) {
                    if (answer_to_free) {
                        free(answer_to_free);
                    }
                }
                xQueueReset(sdp_answer_queue);

                // 3. Open a pristine peer connection
                int ret = esp_peer_open(&cfg, esp_peer_get_default_impl(), &whip_peer);
                if (ret != ESP_PEER_ERR_NONE) {
                    ESP_LOGE(TAG, "Failed to recreate peer connection on retry: %d", ret);
                } else {
                    // 4. Initiate new connection flow
                    ESP_LOGI(TAG, "Initiating recreated WebRTC connection flow...");
                    esp_peer_new_connection(whip_peer);
                }

                connection_start_tick = xTaskGetTickCount();
            }
        }

        // 2. Stream video only when fully connected
        if (peer_connected) {
            if (!initial_delay_done) {
                ESP_LOGI(TAG, "WebRTC connected. Actively stabilizing SRTP context for 2000ms...");
                initial_delay_done = true;
                
                // Actively drive the WebRTC main loop to process all DTLS/SRTP handshake completion steps
                for (int i = 0; i < 200; i++) {
                    if (whip_peer) {
                        esp_peer_main_loop(whip_peer);
                    }
                    vTaskDelay(pdMS_TO_TICKS(10));
                }
                
                last_frame_tick = xTaskGetTickCount();
            }

            TickType_t now = xTaskGetTickCount();

            if ((now - last_frame_tick) >= frame_interval) {
                last_frame_tick = now;

                camera_fb_t *fb = esp_camera_fb_get();
                if (!fb) {
                    ESP_LOGW(TAG, "Camera frame capture timeout");
                } else if (fb->len < 4
                           || fb->buf[0] != 0xFF || fb->buf[1] != 0xD8
                           || fb->buf[fb->len - 2] != 0xFF || fb->buf[fb->len - 1] != 0xD9) {
                    ESP_LOGW(TAG, "Corrupted JPEG (len=%u, hdr=%02X%02X). Dropping.",
                             (unsigned)fb->len, fb->buf[0], fb->buf[1]);
                    esp_camera_fb_return(fb);
                } else {
                    esp_peer_video_frame_t vf = {
                        .pts = frame_count++,
                        .data = fb->buf,
                        .size = (int)fb->len
                    };
                    int ret = ESP_PEER_ERR_NONE;
                    if (whip_peer) {
                        ret = esp_peer_send_video(whip_peer, &vf);
                    } else {
                        ESP_LOGE(TAG, "whip_peer is NULL, cannot send video frame");
                    }
                    if (ret != ESP_PEER_ERR_NONE) {
                        ESP_LOGE(TAG, "Failed to send video frame: %d", ret);
                    }
                    esp_camera_fb_return(fb);
                }
            }
        } else {
            initial_delay_done = false;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
    vTaskDelete(NULL);
}

void app_whip_stream_start(void) {
    if (whip_peer != NULL) {
        ESP_LOGW(TAG, "WHIP stream already started");
        return;
    }

    ESP_LOGI(TAG, "Starting WHIP WebRTC client setup...");

    // Stacks are dynamically allocated in internal memory by FreeRTOS.

    // 2. Generate DTLS credentials ahead of time
    esp_peer_pre_generate_cert();

    // 4. Open peer connection using global static cfg
    int ret = esp_peer_open(&cfg, esp_peer_get_default_impl(), &whip_peer);
    if (ret != ESP_PEER_ERR_NONE) {
        ESP_LOGE(TAG, "Failed to open WebRTC peer connection: %d", ret);
        return;
    }

    peer_running = true;
    sdp_offer_queue = xQueueCreate(2, sizeof(char *));
    sdp_answer_queue = xQueueCreate(2, sizeof(char *));

    // 5. Create tasks — unified main_loop + streaming on Core 1
    BaseType_t ret_pc = xTaskCreatePinnedToCore(
        whip_pc_task, "whip_pc", 32768, NULL, 5, NULL, 1
    );
    if (ret_pc != pdPASS) {
        ESP_LOGE(TAG, "Failed to create whip_pc task");
        return;
    }

    BaseType_t ret_neg = xTaskCreatePinnedToCore(
        whip_negotiation_task, "whip_neg", 8192, NULL, 4, NULL, 1
    );
    if (ret_neg != pdPASS) {
        ESP_LOGE(TAG, "Failed to create whip_neg task");
        return;
    }

    // 6. Start ICE gathering and SDP generation
    ESP_LOGI(TAG, "Initiating WebRTC connection flow...");
    esp_peer_new_connection(whip_peer);
}
