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
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info')
})
