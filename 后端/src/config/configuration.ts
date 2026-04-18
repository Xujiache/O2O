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
