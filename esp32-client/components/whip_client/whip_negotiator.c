#include <stdio.h>
#include <string.h>
#include "esp_http_client.h"
#include "esp_log.h"
#include "cJSON.h"
#include "whip_client.h"
#include "root_ca.h"
#include "config.h"

static const char *TAG = "WHIP_NEG";

typedef struct {
    char *buffer;
    int buffer_len;
    int max_len;
} http_response_t;

static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA) {
        http_response_t *resp = (http_response_t *)evt->user_data;
        if (resp && resp->buffer && evt->data_len > 0) {
            int copy_len = evt->data_len;
            if (resp->buffer_len + copy_len >= resp->max_len) {
                copy_len = resp->max_len - resp->buffer_len - 1;
            }
            if (copy_len > 0) {
                memcpy(resp->buffer + resp->buffer_len, evt->data, copy_len);
                resp->buffer_len += copy_len;
                resp->buffer[resp->buffer_len] = '\0';
            }
        }
    }
    return ESP_OK;
}

esp_err_t app_whip_fetch_token(char *token_out, size_t max_len) {
    char post_data[256];
    snprintf(post_data, sizeof(post_data),
             "{\"deviceId\":\"%s\",\"secret\":\"%s\",\"app\":\"live\",\"stream\":\"%s\"}",
             DEVICE_ID, DEVICE_SECRET, DEVICE_ID);

    char url[256];
    snprintf(url, sizeof(url), "https://%s:%d/api/devices/publish-token", DOMAIN_APP, SERVER_PORT);

    char response[512] = {0};
    http_response_t resp_data = {
        .buffer = response,
        .buffer_len = 0,
        .max_len = sizeof(response)
    };

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .skip_cert_common_name_check = false, // Enable CN check to ensure SNI is sent to Nginx stream mapping!
        .transport_type = HTTP_TRANSPORT_OVER_SSL,
        .cert_pem = ROOT_CA_PEM,
        .crt_bundle_attach = NULL,
        .event_handler = http_event_handler,
        .user_data = &resp_data,
    };

    ESP_LOGI(TAG, "Fetching publish token from: %s", url);
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, post_data, strlen(post_data));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 200) {
            if (resp_data.buffer_len > 0) {
                cJSON *root = cJSON_Parse(response);
                if (root) {
                    cJSON *token = cJSON_GetObjectItem(root, "token");
                    if (token && token->valuestring) {
                        strncpy(token_out, token->valuestring, max_len);
                        token_out[max_len - 1] = '\0';
                        ESP_LOGI(TAG, "Successfully fetched publish token: %s", token_out);
                        err = ESP_OK;
                    } else {
                        ESP_LOGE(TAG, "Token field not found in response JSON");
                        err = ESP_FAIL;
                    }
                    cJSON_Delete(root);
                } else {
                    ESP_LOGE(TAG, "Failed to parse token response JSON: %s", response);
                    err = ESP_FAIL;
                }
            } else {
                ESP_LOGE(TAG, "Empty token response received");
                err = ESP_FAIL;
            }
        } else {
            ESP_LOGE(TAG, "Failed to fetch token. HTTP Status Code: %d, Response: %s", status_code, response);
            err = ESP_FAIL;
        }
    } else {
        ESP_LOGE(TAG, "HTTP perform failed for token request: %s", esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
    return err;
}

esp_err_t app_whip_post_sdp(const char *local_offer_sdp, const char *token, char *answer_sdp_out, size_t max_len) {
    char whip_url[512];
    snprintf(whip_url, sizeof(whip_url), "https://%s:%d/rtc/v1/whip/?app=live&stream=%s&token=%s",
             DOMAIN_MEDIA, SERVER_PORT, DEVICE_ID, token);

    http_response_t resp_data = {
        .buffer = answer_sdp_out,
        .buffer_len = 0,
        .max_len = max_len
    };

    esp_http_client_config_t config = {
        .url = whip_url,
        .method = HTTP_METHOD_POST,
        .skip_cert_common_name_check = false, // Enable CN check to ensure SNI is sent to Nginx stream mapping!
        .transport_type = HTTP_TRANSPORT_OVER_SSL,
        .cert_pem = ROOT_CA_PEM,
        .crt_bundle_attach = NULL,
        .event_handler = http_event_handler,
        .user_data = &resp_data,
    };

    ESP_LOGI(TAG, "Posting WHIP Offer SDP to SRS: %s", whip_url);
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/sdp");
    esp_http_client_set_post_field(client, local_offer_sdp, strlen(local_offer_sdp));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 201 || status_code == 200) { // 201 Created or 200 OK means WHIP negotiation successful
            if (resp_data.buffer_len > 0) {
                ESP_LOGI(TAG, "WHIP Negotiation Successful!");
                err = ESP_OK;
            } else {
                ESP_LOGE(TAG, "Empty WHIP answer SDP received");
                err = ESP_FAIL;
            }
        } else {
            ESP_LOGE(TAG, "WHIP Request Failed. HTTP Status Code: %d, Response: %s", status_code, answer_sdp_out);
            err = ESP_FAIL;
        }
    } else {
        ESP_LOGE(TAG, "HTTP perform failed for WHIP SDP request: %s", esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
    return err;
}
