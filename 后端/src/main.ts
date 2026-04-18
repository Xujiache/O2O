import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

/**
 * 应用启动函数
 * 功能：创建 Nest 应用 → 读取配置 → 注入全局管道/前缀/CORS → 挂载 Swagger → 监听端口
 * 参数：无
 * 返回值：Promise<void>
 * 用途：node dist/main 或 nest start
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // 使用 Nest 内置 Logger，后续 P3 阶段可替换为 Pino/winston
    logger: ['error', 'warn', 'log', 'debug', 'verbose']
  })
  const config = app.get(ConfigService)
  const port = config.get<number>('app.port') ?? 3000
  const prefix = config.get<string>('app.prefix') ?? '/api/v1'
  const env = config.get<string>('app.env') ?? 'development'

  // ===== 全局前缀 =====
  app.setGlobalPrefix(prefix, {
    exclude: ['/health', '/docs', '/docs-json']
  })

  // ===== API 版本化（header 或路径），P3+ 阶段按需启用 =====
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  // ===== CORS（开发环境放开；生产由网关层控制）=====
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  })

  // ===== 全局校验管道（class-validator） =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  )

  // ===== Swagger OpenAPI =====
  const swaggerConfig = new DocumentBuilder()
    .setTitle('O2O 平台 API')
    .setDescription('O2O 跑腿+外卖 一体化平台后端接口文档（对齐 PRD V1.0）')
    .setVersion(config.get<string>('app.version') ?? '0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token'
    )
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true }
  })

  await app.listen(port, '0.0.0.0')

  const logger = new Logger('Bootstrap')
  logger.log(`🚀 [${env}] O2O 后端 已启动，监听 :${port}`)
  logger.log(`📘 API 前缀：${prefix}`)
  logger.log(`📚 Swagger：http://localhost:${port}/docs`)
  logger.log(`❤️  健康检查：http://localhost:${port}/health`)
}

bootstrap().catch((err) => {
  /* 启动失败直接退出进程，由 K8s / pm2 重启 */
  // eslint-disable-next-line no-console
  console.error('[Bootstrap] 启动失败：', err)
  process.exit(1)
})
