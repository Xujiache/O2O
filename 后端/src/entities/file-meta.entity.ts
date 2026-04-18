/**
 * @file entities/file-meta.entity.ts
 * @stage P3/T3.3（桥接 re-export，组长协调）
 * @desc 路径桥接：员工 C 的 file 模块以 `@/entities/file-meta.entity` 形式 import；
 *       真实定义在 `./system/file-meta.entity.ts`（员工 C 维护）。
 *       本文件仅做 re-export，避免修改 C 已写好的 file.controller / file.service。
 * @author 员工 A（组长协调）
 */

export { FileMeta } from './system/file-meta.entity'
