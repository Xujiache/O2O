import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Logger, ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

/**
 * Swagger 分组定义（DESIGN_P3 §7.3）
 *
 * 设计：
 * - 5 组分别独立 URL，由「ApiTags 中文前缀 + 关键字」过滤
 * - "通用 / 文件 / 地图" 等横切模块在多个端展示（路径白名单 + 关键字命中）
 * - includeFilter：返回 true 的 controller 才进该分组
 *
 * 用途：buildSwaggerGroups 内部使用
 */
const SWAGGER_GROUPS: Array<{
  path: 'docs/user' | 'docs/merchant' | 'docs/rider' | 'docs/admin' | 'docs/internal'
  title: string
  desc: string
  includeKeywords: string[]
}> = [
  {
    path: 'docs/user',
    title: 'O2O 平台 API · 用户端',
    desc: '面向 C 端微信小程序：登录 / 个人中心 / 地址 / 文件 / 地图 / 消息',
    includeKeywords: [
      '用户',
      'User',
      '文件',
      'File',
      '地图',
      'Map',
      '消息',
      'Message',
      '认证',
      'Auth'
    ]
  },
  {
    path: 'docs/merchant',
    title: 'O2O 平台 API · 商户端',
    desc: '面向商户 APP / 后台：店铺管理 / 资质 / 订单（P4）',
    includeKeywords: [
      '商户',
      'Merchant',
      '文件',
      'File',
      '地图',
      'Map',
      '消息',
      'Message',
      '认证',
      'Auth'
    ]
  },
  {
    path: 'docs/rider',
    title: 'O2O 平台 API · 骑手端',
    desc: '面向骑手 APP：登录 / 接单 / 位置上报 / 钱包',
    includeKeywords: [
      '骑手',
      'Rider',
      '文件',
      'File',
      '地图',
      'Map',
      '消息',
      'Message',
      '认证',
      'Auth'
    ]
  },
  {
    path: 'docs/admin',
    title: 'O2O 平台 API · 管理后台',
    desc: '运营 / 客服 / 风控 / 财务 后台',
    includeKeywords: [
      '管理',
      'Admin',
      '黑名单',
      '文件',
      'File',
      '地图',
      'Map',
      '消息',
      'Message',
      '认证',
      'Auth'
    ]
  },
  {
    path: 'docs/internal',
    title: 'O2O 平台 API · 内部接口',
    desc: '仅服务间互调：高德缓存预热 / 配送范围 polygon / 健康检查',
    includeKeywords: ['内部', 'Internal', '健康', 'Health', '地图', 'Map']
  }
]

/**
 * 构建并挂载 5 组 Swagger
 *
 * 参数：app NestApplication；config ConfigService
 * 返回值：void
 * 用途：bootstrap 内部调用
 */
function buildSwaggerGroups(app: INestApplication, config: ConfigService): void {
  const version = config.get<string>('app.version') ?? '0.1.0'
  for (const group of SWAGGER_GROUPS) {
    const doc = new DocumentBuilder()
      .setTitle(group.title)
      .setDescription(`${group.desc}\n\n基准：PRD V1.0 + docs/P3_后端基础服务/DESIGN_P3_*.md`)
      .setVersion(version)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'access-token'
      )
      .build()
    const document = SwaggerModule.createDocument(app, doc, {
      include: [],
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`
    })
    // 后置过滤：按 tag 关键字命中
    const filtered = JSON.parse(JSON.stringify(document)) as typeof document
    if (filtered.paths) {
      for (const [path, ops] of Object.entries(filtered.paths)) {
        const opMap = ops as Record<string, { tags?: string[] }>
        const stillMatched: Record<string, unknown> = {}
        for (const [method, op] of Object.entries(opMap)) {
          const tags = op?.tags ?? []
          const hit = tags.some((t) => group.includeKeywords.some((kw) => t.includes(kw)))
          if (hit) stillMatched[method] = op
        }
        if (Object.keys(stillMatched).length > 0) {
          filtered.paths[path] = stillMatched
        } else {
          delete filtered.paths[path]
        }
      }
    }
    SwaggerModule.setup(group.path, app, filtered, {
      swaggerOptions: {
        persistAuthorization: true,
        displayOperationId: false,
        docExpansion: 'list'
      }
    })
  }
  // 兼容旧版 /docs 仍可访问全量
  const fullDoc = new DocumentBuilder()
    .setTitle('O2O 平台 API · 全量')
    .setDescription('全量接口（5 大端汇总）；分组文档见 /docs/user|merchant|rider|admin|internal')
    .setVersion(version)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token'
    )
    .build()
  const fullDocument = SwaggerModule.createDocument(app, fullDoc)
  SwaggerModule.setup('docs', app, fullDocument, {
    swaggerOptions: { persistAuthorization: true }
  })
}

/**
 * 应用启动函数
 * 功能：创建 Nest 应用 → 读取配置 → 注入全局管道/前缀/CORS → 挂载 Swagger 5 组 → 监听端口
 * 参数：无
 * 返回值：Promise<void>
 * 用途：node dist/main 或 nest start
 */
async function bootstrap(): Promise<void> {
  /**
   * P9 Sprint 3 / W3.C.3：rawBody=true 用于微信支付 V3 异步通知签名校验
   *   - 微信 V3 验签依赖未被 body-parser 改写过的原始 JSON 字符串；
   *     若 JSON.parse + JSON.stringify 重新拼接，字段顺序不一致 → 验签失败
   *   - PaymentCallbackController 内优先读 req.rawBody，缺失时退化 JSON.stringify(body) 并 warn
   */
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    rawBody: true
  })
  const config = app.get(ConfigService)
  const port = config.get<number>('app.port') ?? 3000
  const prefix = config.get<string>('app.prefix') ?? '/api/v1'
  const env = config.get<string>('app.env') ?? 'development'

  app.setGlobalPrefix(prefix, {
    exclude: [
      '/health',
      '/metrics',
      '/docs',
      '/docs-json',
      '/docs/user',
      '/docs/merchant',
      '/docs/rider',
      '/docs/admin',
      '/docs/internal'
    ]
  })
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )

  buildSwaggerGroups(app, config)

  await app.listen(port, '0.0.0.0')

  const logger = new Logger('Bootstrap')
  logger.log(`[${env}] O2O 后端 已启动，监听 :${port}`)
  logger.log(`API 前缀：${prefix}`)
  logger.log(`Swagger 全量：http://localhost:${port}/docs`)
  logger.log(`Swagger 用户端：http://localhost:${port}/docs/user`)
  logger.log(`Swagger 商户端：http://localhost:${port}/docs/merchant`)
  logger.log(`Swagger 骑手端：http://localhost:${port}/docs/rider`)
  logger.log(`Swagger 管理后台：http://localhost:${port}/docs/admin`)
  logger.log(`Swagger 内部接口：http://localhost:${port}/docs/internal`)
  logger.log(`健康检查：http://localhost:${port}/health`)
}

bootstrap().catch((err) => {
  /* 启动失败直接退出进程，由 K8s / pm2 重启 */
  // eslint-disable-next-line no-console
  console.error('[Bootstrap] 启动失败：', err)
  process.exit(1)
})
