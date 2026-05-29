#include <stdio.h>
#include <string.h>
#include "esp_http_client.h"
#include "esp_log.h"
#include "cJSON.h"
#include "whip_client.h"
#include "config.h"

static const char *TAG = "WHIP_NEG";

esp_err_t app_whip_fetch_token(char *token_out, size_t max_len) {
    char post_data[256];
    snprintf(post_data, sizeof(post_data),
             "{\"deviceId\":\"%s\",\"secret\":\"%s\",\"app\":\"live\",\"stream\":\"%s\"}",
             DEVICE_ID, DEVICE_SECRET, DEVICE_ID);


    char url[256];
    snprintf(url, sizeof(url), "https://%s:%d/api/devices/publish-token", DOMAIN_APP, SERVER_PORT);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .skip_cert_common_name_check = true, // Bypass SSL for local development
        .transport_type = HTTP_TRANSPORT_OVER_SSL,
    };

    ESP_LOGI(TAG, "Fetching publish token from: %s", url);
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_post_field(client, post_data, strlen(post_data));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 200) {
            char response[512];
            int len = esp_http_client_read_response(client, response, sizeof(response) - 1);
            if (len > 0) {
                response[len] = '\0';
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
                    ESP_LOGE(TAG, "Failed to parse token response JSON");
                    err = ESP_FAIL;
                }
            } else {
                ESP_LOGE(TAG, "Empty token response received");
                err = ESP_FAIL;
            }
        } else {
            ESP_LOGE(TAG, "Failed to fetch token. HTTP Status Code: %d", status_code);
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

    esp_http_client_config_t config = {
        .url = whip_url,
        .method = HTTP_METHOD_POST,
        .skip_cert_common_name_check = true, // Bypass SSL for local development
        .transport_type = HTTP_TRANSPORT_OVER_SSL,
    };

    ESP_LOGI(TAG, "Posting WHIP Offer SDP to SRS: %s", whip_url);
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_set_header(client, "Content-Type", "application/sdp");
    esp_http_client_set_post_field(client, local_offer_sdp, strlen(local_offer_sdp));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status_code = esp_http_client_get_status_code(client);
        if (status_code == 201 || status_code == 200) { // 201 Created or 200 OK means WHIP negotiation successful
            int len = esp_http_client_read_response(client, answer_sdp_out, max_len - 1);
            if (len > 0) {
                answer_sdp_out[len] = '\0';
                ESP_LOGI(TAG, "WHIP Negotiation Successful!");
                err = ESP_OK;
            } else {
                ESP_LOGE(TAG, "Empty WHIP answer SDP received");
                err = ESP_FAIL;
            }
        } else {
            ESP_LOGE(TAG, "WHIP Request Failed. HTTP Status Code: %d", status_code);
            err = ESP_FAIL;
        }
    } else {
        ESP_LOGE(TAG, "HTTP perform failed for WHIP SDP request: %s", esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
    return err;
}
