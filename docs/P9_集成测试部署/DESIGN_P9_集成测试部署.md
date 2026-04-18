# DESIGN_P9_集成测试部署

## 一、目录结构（部署相关）

```
部署/
├── docker/
│   ├── backend/Dockerfile
│   ├── admin-web/Dockerfile
│   ├── nginx/
│   │   ├── Dockerfile
│   │   ├── conf.d/
│   │   │   ├── api.conf
│   │   │   ├── admin.conf
│   │   │   └── ws.conf
│   │   └── nginx.conf
│   ├── mysql/conf.d/my.cnf
│   ├── redis/redis.conf
│   ├── rabbitmq/rabbitmq.conf
│   └── minio/
├── docker-compose.dev.yml
├── docker-compose.staging.yml
├── k8s/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── backend-deployment.yaml
│   │   ├── backend-service.yaml
│   │   ├── backend-hpa.yaml
│   │   ├── admin-web-deployment.yaml
│   │   ├── admin-web-service.yaml
│   │   ├── ingress.yaml
│   │   ├── configmap.yaml
│   │   ├── secret.yaml
│   │   ├── pdb.yaml
│   │   └── networkpolicy.yaml
│   └── overlays/
│       ├── staging/
│       └── production/
├── helm/
│   └── o2o/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-staging.yaml
│       ├── values-production.yaml
│       └── templates/
├── ci/
│   ├── Jenkinsfile
│   └── scripts/
│       ├── build.sh
│       ├── test.sh
│       ├── smoke.sh
│       └── rollback.sh
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── rules/
│   ├── grafana/
│   │   ├── datasources.yaml
│   │   └── dashboards/
│   │       ├── app-overview.json
│   │       ├── business-kpi.json
│   │       ├── db.json
│   │       └── infra.json
│   └── alertmanager/
│       └── alertmanager.yml
├── logging/
│   ├── loki/
│   └── promtail/
├── backup/
│   ├── mysql-backup.sh
│   ├── redis-backup.sh
│   ├── restore-mysql.sh
│   └── cron.yaml
├── runbooks/
│   ├── incident-response.md
│   ├── db-backup.md
│   ├── db-restore.md
│   ├── failover.md
│   ├── scale-up.md
│   └── release-process.md
└── tests/
    ├── perf/
    │   ├── k6-order.js
    │   ├── k6-pay.js
    │   ├── k6-rider-report.js
    │   └── jmeter/*.jmx
    ├── e2e-admin/
    │   └── playwright.config.ts
    ├── e2e-mp/
    │   └── miniprogram/
    └── security/
        └── zap.yaml
```

## 二、后端 Dockerfile（示例）

```Dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY 后端/package.json ./后端/
RUN pnpm install --filter 后端 --frozen-lockfile
COPY 后端/ ./后端/
RUN pnpm --filter 后端 build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/后端/dist ./dist
COPY --from=builder /app/后端/node_modules ./node_modules
COPY --from=builder /app/后端/package.json ./
USER app
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
```

## 三、管理后台 Dockerfile

```Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY 管理后台/package.json 管理后台/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY 管理后台/ ./
RUN pnpm build

FROM nginx:1.25-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY 部署/docker/nginx/conf.d/admin.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## 四、K8s 核心清单

### 4.1 backend-deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: backend, namespace: o2o }
spec:
  replicas: 4
  selector: { matchLabels: { app: backend } }
  template:
    metadata: { labels: { app: backend } }
    spec:
      containers:
      - name: backend
        image: registry.example.com/o2o/backend:{{ .Values.image.tag }}
        ports: [{ containerPort: 3000 }]
        envFrom:
        - configMapRef: { name: backend-config }
        - secretRef: { name: backend-secret }
        resources:
          requests: { cpu: 500m, memory: 512Mi }
          limits:   { cpu: 2,    memory: 2Gi }
        livenessProbe:
          httpGet: { path: /health, port: 3000 }
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet: { path: /health/ready, port: 3000 }
          initialDelaySeconds: 10
          periodSeconds: 5
```

### 4.2 backend-hpa.yaml
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: backend, namespace: o2o }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

### 4.3 ingress.yaml
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: o2o
  namespace: o2o
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  tls:
  - hosts: [api.o2o.com, admin.o2o.com]
    secretName: o2o-tls
  rules:
  - host: api.o2o.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: backend, port: { number: 80 } } }
  - host: admin.o2o.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend: { service: { name: admin-web, port: { number: 80 } } }
```

## 五、Nginx 配置（api.conf 关键片段）

```nginx
upstream backend {
  least_conn;
  server backend:3000 max_fails=2 fail_timeout=10s;
  keepalive 64;
}

server {
  listen 80;
  server_name api.o2o.com;

  client_max_body_size 50m;
  proxy_read_timeout 120s;

  location /health { return 200 'ok'; }

  location /ws {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 7200s;
  }

  location / {
    limit_req zone=api burst=50 nodelay;
    proxy_pass http://backend;
    proxy_set_header X-Real-IP        $remote_addr;
    proxy_set_header X-Forwarded-For  $proxy_add_x_forwarded_for;
    proxy_set_header Host             $host;
  }
}
```

## 六、Jenkinsfile 核心结构

```groovy
pipeline {
  agent any
  environment {
    REGISTRY = 'registry.example.com/o2o'
    IMAGE_TAG = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Lint & Test') {
      parallel {
        stage('Backend')    { steps { sh 'pnpm --filter 后端 lint && pnpm --filter 后端 test:ci' } }
        stage('Admin')      { steps { sh 'pnpm --filter 管理后台 lint && pnpm --filter 管理后台 build' } }
      }
    }
    stage('Security Scan') {
      steps {
        sh 'trivy image --severity HIGH,CRITICAL $REGISTRY/backend:$IMAGE_TAG'
        sh 'snyk test --all-projects'
      }
    }
    stage('Build & Push') {
      steps {
        sh 'docker build -t $REGISTRY/backend:$IMAGE_TAG -f 部署/docker/backend/Dockerfile .'
        sh 'docker build -t $REGISTRY/admin:$IMAGE_TAG -f 部署/docker/admin-web/Dockerfile .'
        sh 'docker push $REGISTRY/backend:$IMAGE_TAG'
        sh 'docker push $REGISTRY/admin:$IMAGE_TAG'
      }
    }
    stage('Deploy Staging') {
      steps {
        sh 'helm upgrade --install o2o 部署/helm/o2o -n o2o-staging -f 部署/helm/o2o/values-staging.yaml --set image.tag=$IMAGE_TAG'
      }
    }
    stage('Smoke Test') {
      steps { sh 'bash 部署/ci/scripts/smoke.sh staging' }
    }
    stage('Approval') { steps { input '部署到生产？' } }
    stage('Deploy Prod') {
      steps {
        sh 'helm upgrade --install o2o 部署/helm/o2o -n o2o-production -f 部署/helm/o2o/values-production.yaml --set image.tag=$IMAGE_TAG'
      }
    }
    stage('Post Smoke') { steps { sh 'bash 部署/ci/scripts/smoke.sh production' } }
  }
  post {
    success { sh 'bash 部署/ci/scripts/notify.sh success' }
    failure { sh 'bash 部署/ci/scripts/notify.sh failure' }
  }
}
```

## 七、k6 压测脚本（下单 1000 TPS 示例）

```js
// 部署/tests/perf/k6-order.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m',  target: 200  },
    { duration: '5m',  target: 1000 },
    { duration: '10m', target: 1000 },
    { duration: '2m',  target: 0    }
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.01'],
  }
};

export default function () {
  const token = __ENV.TOKEN;
  const res = http.post(`${__ENV.API}/user/order/takeout`, JSON.stringify({
    shopId: 1, addressId: 1, items: [{ skuId: 1, count: 1 }]
  }), { headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` } });
  check(res, { '201': r => r.status === 201 });
  sleep(1);
}
```

## 八、Prometheus 指标设计

后端通过 `@willsoto/nestjs-prometheus` 暴露：
- `http_requests_total{path, method, status}`
- `http_request_duration_seconds_bucket`
- `order_created_total{type}`
- `order_paid_total`
- `dispatch_decision_duration_seconds`
- `rider_location_reports_total`
- `business_rpc_failure_total{service, reason}`

Redis / MySQL / RabbitMQ 用官方 Exporter。

## 九、Grafana 面板
- **app-overview**：QPS、P95、5xx、活跃用户
- **business-kpi**：订单量/成功率/GMV/活跃骑手
- **db**：连接/慢查询/主从延迟
- **infra**：节点 CPU/内存/磁盘/网络

## 十、AlertManager 路由
- P0（核心下线）：短信 + 电话
- P1（性能退化）：企业微信群 + 短信
- P2（告警）：企业微信
- 业务告警（支付失败率高）：独立通道

## 十一、Runbook 模板
`runbooks/incident-response.md`：
1. 接警 → 确认告警级别
2. 查看 Grafana → 初步定位（应用/DB/依赖）
3. 执行既定 Runbook：扩容/重启/降级/回滚
4. 记录时间线
5. 事后复盘（5Whys）

## 十二、备份与恢复脚本

### 12.1 `mysql-backup.sh`
```bash
#!/bin/bash
set -e
DATE=$(date +%Y%m%d_%H%M)
xtrabackup --backup --target-dir=/backup/mysql/$DATE \
  --user=$DB_USER --password=$DB_PASS
xtrabackup --prepare --target-dir=/backup/mysql/$DATE
tar -czf /backup/mysql/$DATE.tar.gz -C /backup/mysql $DATE
rm -rf /backup/mysql/$DATE
# 上传异地
aws s3 cp /backup/mysql/$DATE.tar.gz s3://o2o-backup/mysql/
# 保留 30 天
find /backup/mysql -name "*.tar.gz" -mtime +30 -delete
```

### 12.2 恢复
`runbooks/db-restore.md` 详细步骤 + 定期演练清单。

## 十三、APP 上架准备

### 13.1 iOS
- 开发者账号（企业或公司）
- App Store Connect 配置
- 隐私政策、权限说明
- 截图 / 描述 / 关键词
- TestFlight 先发

### 13.2 Android
- 华为/小米/OPPO/VIVO 各自开发者账号
- 软著证明
- 隐私合规检测报告
- 签名密钥保管

## 十四、小程序上架准备
- 类目：外卖 / 跑腿（需资质）
- 微信支付开通
- 配置服务器域名 / 合法域名
- 备案完成
- 提交审核前自查：是否有测试数据、是否引导关注公众号、是否涉黄涉赌

## 十五、产物
- 全量源码
- Dockerfile、K8s/Helm、Jenkins Pipeline
- 监控/日志/备份/Runbook
- 测试用例 & 报告
- APP/小程序上架资料
