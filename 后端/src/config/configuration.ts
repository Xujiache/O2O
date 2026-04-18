/**
 * 后端配置工厂函数
 * 功能：将 process.env 汇聚为分组明确的对象，供 ConfigService.get('xxx.yyy') 使用
 * 参数：无（直接读取 process.env）
 * 返回值：嵌套配置对象
 * 用途：在 app.module.ts 中注入 ConfigModule.forRoot({ load: [configuration] })
 */
export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'o2o-server',
    version: process.env.APP_VERSION ?? '0.1.0',
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.APP_PORT ?? '3000', 10),
    prefix: process.env.APP_PREFIX ?? '/api/v1'
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME ?? 'o2o_platform',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true'
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASS ?? '',
    db: parseInt(process.env.REDIS_DB ?? '0', 10)
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '7200', 10)
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? '',
    queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX ?? 'o2o'
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
    bucket: process.env.MINIO_BUCKET ?? 'o2o-platform'
  },
  // ===== P3 / 文件存储（员工 C 新增）=====
  // STORAGE_PROVIDER 在 minio | ali-oss 间切换；其他 OSS 字段在 oss.* 下
  file: {
    provider: process.env.STORAGE_PROVIDER ?? 'minio',
    publicBucket: process.env.STORAGE_PUBLIC_BUCKET ?? 'o2o-public',
    privateBucket: process.env.STORAGE_PRIVATE_BUCKET ?? 'o2o-private',
    tempBucket: process.env.STORAGE_TEMP_BUCKET ?? 'o2o-temp',
    region: process.env.STORAGE_REGION ?? 'cn-north-1',
    cdnPrefix: process.env.STORAGE_CDN_PREFIX ?? ''
  },
  oss: {
    endpoint: process.env.OSS_ENDPOINT ?? '',
    port: parseInt(process.env.OSS_PORT ?? '443', 10),
    useSSL: (process.env.OSS_USE_SSL ?? 'true') === 'true',
    accessKey: process.env.OSS_ACCESS_KEY_ID ?? '',
    secretKey: process.env.OSS_ACCESS_KEY_SECRET ?? '',
    region: process.env.OSS_REGION ?? 'oss-cn-hangzhou'
  },
  // ===== P3 / 地图服务（员工 C 新增）=====
  map: {
    provider: process.env.MAP_PROVIDER ?? 'amap',
    amapKey: process.env.AMAP_KEY ?? process.env.MAP_AK ?? '',
    amapBaseUrl: process.env.AMAP_BASE_URL ?? 'https://restapi.amap.com',
    httpTimeoutMs: parseInt(process.env.AMAP_HTTP_TIMEOUT_MS ?? '5000', 10),
    riderReportBatchSize: parseInt(process.env.RIDER_REPORT_BATCH_SIZE ?? '2000', 10),
    riderReportFlushIntervalMs: parseInt(process.env.RIDER_REPORT_FLUSH_INTERVAL_MS ?? '1000', 10)
  },
  // ===== P3 / TimescaleDB（员工 C 新增）=====
  timescale: {
    host: process.env.TIMESCALE_HOST ?? 'localhost',
    port: parseInt(process.env.TIMESCALE_PORT ?? '5432', 10),
    database: process.env.TIMESCALE_DB ?? 'o2o_timescale',
    username: process.env.TIMESCALE_USER ?? 'o2o_ts',
    password: process.env.TIMESCALE_PASS ?? 'o2o_ts_2026',
    poolMax: parseInt(process.env.TIMESCALE_POOL_MAX ?? '10', 10)
  },
  thirdParty: {
    wechatMpAppid: process.env.WECHAT_MP_APPID ?? '',
    wechatMpSecret: process.env.WECHAT_MP_SECRET ?? '',
    wechatPayMchid: process.env.WECHAT_PAY_MCHID ?? '',
    wechatPayApiV3Key: process.env.WECHAT_PAY_APIV3_KEY ?? '',
    alipayAppid: process.env.ALIPAY_APPID ?? '',
    alipayPrivateKey: process.env.ALIPAY_PRIVATE_KEY ?? '',
    smsAk: process.env.SMS_AK ?? '',
    smsSk: process.env.SMS_SK ?? '',
    pushProvider: process.env.PUSH_PROVIDER ?? 'jpush',
    mapProvider: process.env.MAP_PROVIDER ?? 'amap',
    mapAk: process.env.MAP_AK ?? ''
  },
  log: {
    level: process.env.LOG_LEVEL ?? 'info'
  }
})
