/**
 * @file validation-pipe.e2e-spec.ts
 * @stage P9 Sprint 7 / W7.B.1（P9-P3-01）
 * @desc 验证 buildTestApp 中 ValidationPipe 全部分支被有效覆盖
 *
 * setup.ts 中 ValidationPipe 配置：
 *   - whitelist: true            → 未在 DTO 中声明的字段被剥离
 *   - forbidNonWhitelisted: true → 未声明字段时直接 400 拒绝
 *   - transform: true            → 入参转为 DTO 类实例
 *   - transformOptions.enableImplicitConversion: true → string→number/boolean 隐式转换
 *
 * 覆盖矩阵（与 class-validator 装饰器一一对应）：
 *   1. 缺必填字段（@IsString + @IsNotEmpty） → 400
 *   2. 类型不符（@IsInt 收到字符串非数字） → 400
 *   3. 边界越界（@Min / @Max） → 400
 *   4. 正则不匹配（@Matches） → 400
 *   5. 枚举值非法（@IsEnum） → 400
 *   6. forbidNonWhitelisted（多余字段） → 400
 *   7. 隐式类型转换（"5" → 5）正常通过 → 200
 *
 * 设计：使用一个内联 ValidationProbeController（不依赖任何业务 module / service）
 * 仅靠 buildTestApp 把 ValidationPipe + GlobalPrefix 装上即可。
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Get,
  type INestApplication
} from '@nestjs/common'
import { IsEnum, IsInt, IsString, Matches, Max, Min, IsNotEmpty } from 'class-validator'
import { Type } from 'class-transformer'
import request from 'supertest'
import { buildTestApp } from './setup'

/* ========== Probe DTO ========== */

class ProbeBodyDto {
  @IsString()
  @IsNotEmpty()
  name!: string

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  age!: number

  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不合法' })
  mobile!: string

  @IsEnum(['login', 'bind', 'register'])
  scene!: 'login' | 'bind' | 'register'
}

class ProbeQueryDto {
  /* enableImplicitConversion 时 query string "5" 应被转 number */
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  page!: number
}

/* ========== Probe Controller（仅用于 ValidationPipe 触发） ========== */

@Controller('probe')
class ValidationProbeController {
  @Post('echo')
  @HttpCode(HttpStatus.OK)
  echo(@Body() body: ProbeBodyDto): { ok: true; received: ProbeBodyDto } {
    return { ok: true, received: body }
  }

  @Get('paginate')
  paginate(@Query() q: ProbeQueryDto): { ok: true; page: number; pageType: string } {
    return { ok: true, page: q.page, pageType: typeof q.page }
  }
}

describe('ValidationPipe 触发覆盖 (P9-P3-01)', () => {
  let app: INestApplication

  beforeAll(async () => {
    /* 不挂全局前缀 / versioning，免去 /api/v1/v1 干扰 ValidationPipe 本身的覆盖 */
    app = await buildTestApp({
      controllers: [ValidationProbeController],
      withGlobalPrefix: false
    })
  })

  afterAll(async () => {
    if (app) await app.close()
  })

  /* ===================== 反例：每个装饰器都被触发 ===================== */

  it('1) 缺 name 字段 → 400 + 含 IsNotEmpty/IsString 错误信息', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      age: 18,
      mobile: '13800138000',
      scene: 'login'
    })
    expect(res.status).toBe(400)
    /* class-validator 错误信息会被收集到 message 数组（Nest 默认 ValidationError → BadRequest）*/
    const msg = JSON.stringify(res.body)
    expect(msg).toMatch(/name/i)
  })

  it('2) age 类型非法（无法转 int） → 400', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 'abc',
      mobile: '13800138000',
      scene: 'login'
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/age/i)
  })

  it('3) age 越界（Min/Max） → 400', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 200,
      mobile: '13800138000',
      scene: 'login'
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/age/i)
  })

  it('4) mobile 正则不匹配（@Matches） → 400 含自定义 message', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 18,
      mobile: '12345',
      scene: 'login'
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/手机号格式不合法|mobile/i)
  })

  it('5) scene 枚举值非法（@IsEnum） → 400', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 18,
      mobile: '13800138000',
      scene: 'invalid_scene'
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/scene/i)
  })

  it('6) forbidNonWhitelisted（多余字段 evilField） → 400', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 18,
      mobile: '13800138000',
      scene: 'login',
      evilField: 'should-be-rejected'
    })
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/evilField|property.*should not exist|whitelist/i)
  })

  /* ===================== 正例：transform 隐式转换通过 ===================== */

  it('7) Body 全部合法 → 200 + 数据回显（验证 transform 落 DTO 实例）', async () => {
    const res = await request(app.getHttpServer()).post('/probe/echo').send({
      name: 'alice',
      age: 18,
      mobile: '13800138000',
      scene: 'register'
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      code: 0,
      data: {
        ok: true,
        received: {
          name: 'alice',
          age: 18,
          mobile: '13800138000',
          scene: 'register'
        }
      }
    })
  })

  it('8) Query "5" → enableImplicitConversion 转为 number 5（typeof number）', async () => {
    const res = await request(app.getHttpServer()).get('/probe/paginate?page=5')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      code: 0,
      data: { ok: true, page: 5, pageType: 'number' }
    })
  })

  it('9) Query page 越界（Max 50） → 400', async () => {
    const res = await request(app.getHttpServer()).get('/probe/paginate?page=999')
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/page/i)
  })
})
