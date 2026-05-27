# Phase 3 Gateway Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, single-port Nginx SNI-routing gateway in Docker that aggregates all HTTP, HTTPS, WebSocket, and WebRTC over TCP traffic onto port 443, completely hiding the SRS media server behind the private network boundary.

**Architecture:** Nginx uses the stream module's `ssl_preread` to inspect the SNI of incoming TLS connections on port 443. It routes `app.local.test` to its own L7 HTTPS decryption block (which reverse-proxies to Node.js on `host.docker.internal:3000`), and forwards `media.local.test` (and default fallback) to SRS's TCP listener on port `8443` for native TLS/DTLS handling.

**Tech Stack:** Docker, Nginx (Stream module with `ssl_preread`), SRS 6.0, mkcert (local TLS).

---

### Task 1: Environment & SSL setup

**Files:**
* Modify: `C:\Windows\System32\drivers\etc\hosts` (Manual action)
* Create: `nginx/certs/local.test.pem` (via `mkcert`)
* Create: `nginx/certs/local.test-key.pem` (via `mkcert`)

- [ ] **Step 1: Configure Local Virtual Domains**
  
  Add the following lines to `C:\Windows\System32\drivers\etc\hosts`:
  ```text
  127.0.0.1   app.local.test
  127.0.0.1   media.local.test
  ```

- [ ] **Step 2: Initialize mkcert**
  
  Run the command:
  ```powershell
  mkcert -install
  ```
  Expected output: Local CA successfully installed in system trust stores.

- [ ] **Step 3: Generate TLS Certificates**
  
  Create directory and generate certs:
  ```powershell
  mkdir nginx/certs
  mkcert -cert-file nginx/certs/local.test.pem -key-file nginx/certs/local.test-key.pem app.local.test media.local.test 127.0.0.1 host.docker.internal
  ```
  Expected output: Two files `local.test.pem` and `local.test-key.pem` created inside `nginx/certs/`.

- [ ] **Step 4: Commit**
  
  ```bash
  git add nginx/certs/.gitignore
  git commit -m "infra: setup local TLS folder and host names"
  ```

---

### Task 2: Nginx Gateway Configuration

**Files:**
* Create: `nginx/nginx.conf`

- [ ] **Step 1: Write Nginx Configuration**
  
  Write the following configuration to `nginx/nginx.conf`:
  ```nginx
  user nginx;
  worker_processes auto;
  error_log /var/log/nginx/error.log error;
  pid /var/run/nginx.pid;

  events {
      worker_connections 1024;
  }

  stream {
      ssl_preread on;

      map $ssl_preread_server_name $backend_target {
          app.local.test     nginx_l7_app;
          media.local.test   srs_l4_media;
          default            srs_l4_media;
      }

      upstream nginx_l7_app {
          server 127.0.0.1:3443;
      }

      upstream srs_l4_media {
          server srs_media_server:8443;
      }

      server {
          listen 443;
          proxy_pass $backend_target;
          proxy_timeout 10m;
          proxy_connect_timeout 30s;
      }
  }

  http {
      include /etc/nginx/mime.types;
      default_type application/octet-stream;
      
      access_log off;
      sendfile on;
      keepalive_timeout 65;

      server {
          listen 127.0.0.1:3443 ssl;
          server_name app.local.test;

          ssl_certificate /etc/nginx/certs/local.test.pem;
          ssl_certificate_key /etc/nginx/certs/local.test-key.pem;

          ssl_protocols TLSv1.2 TLSv1.3;
          ssl_ciphers HIGH:!aNULL:!MD5;

          location / {
              proxy_pass http://host.docker.internal:3000;
              
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade";
              
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
      }
  }
  ```

- [ ] **Step 2: Verify Configuration Syntax**
  
  Run test inside temporary docker run:
  ```powershell
  docker run --rm -v ${PWD}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro nginx:1.25-alpine nginx -t
  ```
  Expected output: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok`

- [ ] **Step 3: Commit**
  
  ```bash
  git add nginx/nginx.conf
  git commit -m "feat: configure nginx SNI stream gateway"
  ```

---

### Task 3: Adapting SRS流媒体配置

**Files:**
* Modify: `srs.conf`

- [ ] **Step 1: Update srs.conf**
  
  Replace the entire content of `srs.conf` with:
  ```text
  # SRS 6.0 Configuration for HomeGuard-RTC (Phase 3 Adaptation)

  listen              1935;
  max_connections     1000;
  daemon              off;
  srs_log_tank        console;

  http_server {
      enabled         on;
      listen          8080;
      dir             ./objs/nginx/html;
  }

  http_api {
      enabled         on;
      listen          1985;
  }

  https_server {
      enabled         on;
      listen          8443;
      key             ./conf/certs/local.test-key.pem;
      cert            ./conf/certs/local.test.pem;
  }

  stats {
      network         0;
  }

  stream_caster {
      enabled         off;
  }

  vhost __defaultVhost__ {
      http_hooks {
          enabled         on;
          on_publish      http://host.docker.internal:3000/internal/srs/on-publish;
          on_play         http://host.docker.internal:3000/internal/srs/on-play;
          on_stop         http://host.docker.internal:3000/internal/srs/on-stop;
      }

      rtc {
          enabled     on;
          bframe      discard;
      }
  }

  rtc_server {
      enabled         on;
      protocol        tcp;
      candidate       media.local.test;
      
      tcp {
          enabled     on;
          listen      8443;
      }
  }
  ```

- [ ] **Step 2: Commit**
  
  ```bash
  git add srs.conf
  git commit -m "config: adapt srs.conf for port-443 SNI and HTTPS certificate"
  ```

---

### Task 4: Orchestrating Docker Compose

**Files:**
* Modify: `docker-compose.yml`

- [ ] **Step 1: Update docker-compose.yml**
  
  Replace `docker-compose.yml` contents with:
  ```yaml
  version: "3.9"

  services:
    nginx:
      image: nginx:1.25-alpine
      container_name: nginx_gateway
      ports:
        - "443:443"
      volumes:
        - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
        - ./nginx/certs:/etc/nginx/certs:ro
      restart: always
      depends_on:
        - srs
      extra_hosts:
        - "host.docker.internal:host-gateway"
      networks:
        - homeguard_net

    srs:
      image: ossrs/srs:6
      container_name: srs_media_server
      volumes:
        - ./srs.conf:/usr/local/srs/conf/srs.conf
        - ./nginx/certs:/usr/local/srs/conf/certs:ro
      command: ["./objs/srs", "-c", "conf/srs.conf"]
      restart: always
      extra_hosts:
        - "host.docker.internal:host-gateway"
      networks:
        - homeguard_net

  networks:
    homeguard_net:
      driver: bridge
  ```

- [ ] **Step 2: Commit**
  
  ```bash
  git add docker-compose.yml
  git commit -m "infra: hide SRS ports and expose unified Nginx 443 gateway"
  ```

---

### Task 5: Launch & Integration Verification

**Files:**
* Test: Integration loop (Manual / Console verification)

- [ ] **Step 1: Start Docker Compose Services**
  
  Run:
  ```powershell
  docker compose down
  docker compose up -d
  ```
  Expected output: `nginx_gateway` and `srs_media_server` started successfully.

- [ ] **Step 2: Start Node.js Backend Service**
  
  Start Node.js server from host:
  ```powershell
  pnpm --prefix nitro-app run dev
  ```
  Expected: Nitro backend server listening on `127.0.0.1:3000`.

- [ ] **Step 3: Test HTTPS Routing to Node**
  
  Open browser or run curl to test Nginx routing and SSL trust:
  ```powershell
  curl -k https://app.local.test/api/hello
  ```
  Expected output: JSON containing hello payload from Nitro.

- [ ] **Step 4: Test HTTPS Routing to SRS Signaling**
  
  Check WHEP signaling API:
  ```powershell
  curl -k https://media.local.test:443/rtc/v1/whep/
  ```
  Expected output: HTTP 405 (Method Not Allowed) or standard SRS HTTP response, confirming TLS is fully terminated by SRS on `8443` through the Nginx gateway L4 tunnel.
