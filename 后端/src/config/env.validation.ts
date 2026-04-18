import * as Joi from 'joi'

/**
 * 环境变量校验 Schema（Joi）
 * 功能：后端启动前强校验 .env 文件的必填项与类型，及早失败。
 *      DESIGN_P1 §4 规定后端必须包含 joi 校验。
 * 参数：无（由 @nestjs/config 的 validationSchema 自动应用）
 * 返回值：Joi.ObjectSchema
 * 用途：app.module.ts 中 ConfigModule.forRoot({ validationSchema })
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),

  APP_NAME: Joi.string().default('o2o-server'),
  APP_VERSION: Joi.string().default('0.1.0'),
  APP_PORT: Joi.number().port().default(3000),
  APP_PREFIX: Joi.string().default('/api/v1'),

  // MySQL（必填）
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),

  // Redis（必填）
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASS: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),

  // JWT（生产环境必须设置，开发可用默认占位）
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.number().integer().positive().default(7200),

  // RabbitMQ（P3 阶段启用，P1 允许为空）
  RABBITMQ_URL: Joi.string().allow('').default(''),
  RABBITMQ_QUEUE_PREFIX: Joi.string().default('o2o'),

  // MinIO（P3 阶段启用，P1 允许为空）
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_USE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  MINIO_ACCESS_KEY: Joi.string().allow('').default(''),
  MINIO_SECRET_KEY: Joi.string().allow('').default(''),
  MINIO_BUCKET: Joi.string().default('o2o-platform'),

  // P3 / 文件存储（员工 C 新增）
  STORAGE_PROVIDER: Joi.string().valid('minio', 'ali-oss').default('minio'),
  STORAGE_PUBLIC_BUCKET: Joi.string().default('o2o-public'),
  STORAGE_PRIVATE_BUCKET: Joi.string().default('o2o-private'),
  STORAGE_TEMP_BUCKET: Joi.string().default('o2o-temp'),
  STORAGE_REGION: Joi.string().default('cn-north-1'),
  STORAGE_CDN_PREFIX: Joi.string().allow('').default(''),
  // 阿里云 OSS（生产）
  OSS_ENDPOINT: Joi.string().allow('').default(''),
  OSS_PORT: Joi.number().port().default(443),
  OSS_USE_SSL: Joi.boolean().truthy('true').falsy('false').default(true),
  OSS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  OSS_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  OSS_REGION: Joi.string().default('oss-cn-hangzhou'),
  OSS_STS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  OSS_STS_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  OSS_RAM_ROLE_ARN: Joi.string().allow('').default(''),

  // P3 / 高德地图（员工 C 新增）
  AMAP_KEY: Joi.string().allow('').default(''),
  AMAP_BASE_URL: Joi.string().uri().default('https://restapi.amap.com'),
  AMAP_HTTP_TIMEOUT_MS: Joi.number().integer().min(500).max(30000).default(5000),

  // P3 / 骑手位置批量写参数（员工 C 新增）
  RIDER_REPORT_BATCH_SIZE: Joi.number().integer().min(1).max(10000).default(2000),
  RIDER_REPORT_FLUSH_INTERVAL_MS: Joi.number().integer().min(100).max(60000).default(1000),

  // P3 / TimescaleDB 连接（员工 C 新增）
  TIMESCALE_HOST: Joi.string().default('localhost'),
  TIMESCALE_PORT: Joi.number().port().default(5432),
  TIMESCALE_DB: Joi.string().default('o2o_timescale'),
  TIMESCALE_USER: Joi.string().default('o2o_ts'),
  TIMESCALE_PASS: Joi.string().allow('').default('o2o_ts_2026'),
  TIMESCALE_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),

  // P3 / 加密密钥（CryptoUtil 用，员工 A 落地后会做强校验，本期允许空）
  CURRENT_ENC_KEY_VER: Joi.number().integer().min(1).default(1),
  ENC_KEY_V1: Joi.string().allow('').default(''),
  HMAC_KEY_V1: Joi.string().allow('').default(''),

  // P3 / Snowflake worker（员工 C 新增）
  SNOWFLAKE_WORKER_ID: Joi.string().allow('').default(''),

  // 第三方（P3+ 阶段填入）
  WECHAT_MP_APPID: Joi.string().allow('').default(''),
  WECHAT_MP_SECRET: Joi.string().allow('').default(''),
  WECHAT_PAY_MCHID: Joi.string().allow('').default(''),
  WECHAT_PAY_APIV3_KEY: Joi.string().allow('').default(''),
  ALIPAY_APPID: Joi.string().allow('').default(''),
  ALIPAY_PRIVATE_KEY: Joi.string().allow('').default(''),
  SMS_AK: Joi.string().allow('').default(''),
  SMS_SK: Joi.string().allow('').default(''),
  PUSH_PROVIDER: Joi.string().valid('jpush', 'getui').default('jpush'),
  MAP_PROVIDER: Joi.string().valid('amap', 'bmap').default('amap'),
  MAP_AK: Joi.string().allow('').default(''),

  // 日志
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  // ===== P3/T3.4 管理后台签名（可选；不传时 ThrottleSignGuard 在生产环境拒登）=====
  // 说明：ENC_KEY_V1 / HMAC_KEY_V1 / CURRENT_ENC_KEY_VER / SNOWFLAKE_WORKER_ID
  //      已在上方第 87~93 行（A/C 增量段）声明；此处不再重复，避免对象字面量重复键
  ADMIN_SIGN_APP_KEY: Joi.string().allow('').default(''),
  ADMIN_SIGN_APP_SECRET: Joi.string().allow('').default(''),
  ADMIN_APP_KEYS: Joi.string().allow('').default('')
})
