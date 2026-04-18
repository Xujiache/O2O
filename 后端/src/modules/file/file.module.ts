import { Module, type FactoryProvider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FileMeta } from '@/entities/file-meta.entity'
import { AliOssAdapter } from './adapters/ali-oss.adapter'
import { MinioAdapter } from './adapters/minio.adapter'
import {
  STORAGE_ADAPTER,
  type BucketKind,
  type StorageAdapter,
  type StorageAdapterOptions
} from './adapters/storage.adapter'
import { FileController } from './file.controller'
import { FileService } from './file.service'

/**
 * 存储适配器工厂
 *
 * 设计：
 * - 通过 STORAGE_PROVIDER（minio | ali-oss）env 切换实现
 * - 各 bucket 名称从 file.publicBucket / file.privateBucket / file.tempBucket 读取
 * - cdnPrefix 可选，用于 CDN 接入
 *
 * 用途：file.module 内部 useFactory 注册到 STORAGE_ADAPTER token
 */
const storageAdapterProvider: FactoryProvider<StorageAdapter> = {
  provide: STORAGE_ADAPTER,
  useFactory: (config: ConfigService): StorageAdapter => {
    const provider = config.get<string>('file.provider', 'minio')
    const buckets: Record<BucketKind, string> = {
      public: config.get<string>('file.publicBucket', 'o2o-public'),
      private: config.get<string>('file.privateBucket', 'o2o-private'),
      temp: config.get<string>('file.tempBucket', 'o2o-temp')
    }
    const options: StorageAdapterOptions = {
      endpoint: config.get<string>('minio.endpoint', 'localhost'),
      port: config.get<number>('minio.port', 9000),
      useSSL: config.get<boolean>('minio.useSSL', false),
      accessKey: config.get<string>('minio.accessKey', ''),
      secretKey: config.get<string>('minio.secretKey', ''),
      region: config.get<string>('file.region', 'cn-north-1'),
      buckets,
      cdnPrefix: config.get<string>('file.cdnPrefix', '')
    }
    if (provider === 'ali-oss') {
      // AliOSS 用相同的 endpoint/secret 字段，部署时改填 OSS 的 ak/sk + endpoint/region 即可
      const ossOptions: StorageAdapterOptions = {
        ...options,
        endpoint: config.get<string>('oss.endpoint', options.endpoint),
        port: config.get<number>('oss.port', 443),
        useSSL: config.get<boolean>('oss.useSSL', true),
        accessKey: config.get<string>('oss.accessKey', options.accessKey),
        secretKey: config.get<string>('oss.secretKey', options.secretKey),
        region: config.get<string>('oss.region', 'oss-cn-hangzhou')
      }
      return new AliOssAdapter(ossOptions)
    }
    return new MinioAdapter(options)
  },
  inject: [ConfigService]
}

/**
 * 文件存储模块（DESIGN_P3 §五）
 *
 * 用途：
 * - 注册 4 个对外接口（upload / sts / presign / remove）+ 1 个反查
 * - 通过 env STORAGE_PROVIDER 切换 MinIO / AliOSS 适配器
 * - 业务模块 import FileModule + FileService 后即可写文件
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([FileMeta])],
  controllers: [FileController],
  providers: [storageAdapterProvider, FileService],
  exports: [FileService, STORAGE_ADAPTER]
})
export class FileModule {}
