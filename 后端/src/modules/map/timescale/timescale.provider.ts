import { Logger, type FactoryProvider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool, type PoolConfig } from 'pg'

/** TimescaleDB Pool 注入 Token */
export const TIMESCALE_POOL = Symbol('TIMESCALE_POOL')

/**
 * TimescaleDB 连接池 Provider
 *
 * 设计：
 * - 全进程单 pg.Pool；TimescaleDB 当 PostgreSQL 用，自动启用 timescaledb 扩展
 * - 失败不阻塞进程启动：连接错误时打 warn，由实际查询处感知（开发态 timescale 容器
 *   可能未启动）
 * - 数据库 schema 由 P2 timescale/01_schema.sql 维护，本 Provider 不做迁移
 *
 * 用途：rider-location.consumer 注入后批量 INSERT；map.controller.queryTrack 查询
 */
export const timescalePoolProvider: FactoryProvider<Pool> = {
  provide: TIMESCALE_POOL,
  useFactory: (config: ConfigService): Pool => {
    const logger = new Logger('TimescalePool')
    const poolConfig: PoolConfig = {
      host: config.get<string>('timescale.host', 'localhost'),
      port: config.get<number>('timescale.port', 5432),
      database: config.get<string>('timescale.database', 'o2o_timescale'),
      user: config.get<string>('timescale.username', 'o2o_ts'),
      password: config.get<string>('timescale.password', 'o2o_ts_2026'),
      max: config.get<number>('timescale.poolMax', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    }
    const pool = new Pool(poolConfig)
    pool.on('error', (err) => logger.warn(`TimescaleDB pool 错误：${err.message}`))
    logger.log(
      `TimescaleDB Pool 已构建 ${poolConfig.user}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`
    )
    return pool
  },
  inject: [ConfigService]
}
