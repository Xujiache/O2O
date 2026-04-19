# 骑手端静态资源说明

> 本目录已规避 P6-R1 / I-03 教训：所有外部引用资源 **必须真实存在文件**（哪怕 0 字节占位），
> 否则 build 阶段 vite-plugin-uni 报 missing-resource，运行期 audioCtx / image 加载报 404。
>
> **P7-R1 / R-01 增强**：new-dispatch.mp3 由 0 字节占位升级为 **432 字节真最小有效 MP3**
> （MPEG-1 Layer III, 32kbps, 32kHz, mono, 3 frame × 144B ≈ 0.108s silent）。
> 现在所有资源均为真有效文件，audioCtx.play() 不再触发 onError；与 silent.wav (45B) /
> marker (67B) 处理一致。

## 当前占位文件

| 资源                        | 大小     | 用途                                                                                                  | 状态                           |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `audio/silent.wav`          | 45 字节  | iOS 静音音频保活（`startSilentAudio`），mono 8kHz 8-bit 1 sample silence —— **可直接用于 P9 灰度**    | ✅ 真有效 WAV                  |
| `audio/new-dispatch.mp3`    | 432 字节 | 派单铃声循环（`startRingtone`），MPEG-1 Layer III 3 frame silent ≈ 0.108s —— P9 替换为 1-2 秒真提示音 | ✅ ≤1KB 真最小有效 MP3 (P7-R1) |
| `marker/marker-rider.png`   | 67 字节  | 内置地图骑手当前位置图标，1×1 透明 PNG                                                                | ⚠️ 占位 PNG                    |
| `marker/marker-pickup.png`  | 67 字节  | 内置地图取件点图标                                                                                    | ⚠️ 占位 PNG                    |
| `marker/marker-deliver.png` | 67 字节  | 内置地图送达点图标                                                                                    | ⚠️ 占位 PNG                    |

## P7-R1 / R-01 生成命令

无 ffmpeg 环境降级方案 B：Node 硬编码 MPEG-1 Layer III frame：

```bash
node 骑手端/scripts/gen-min-mp3.mjs
# → 生成 432 字节 MPEG-1 Layer III silent MP3
#   header: FF FB 18 C0 (32 kbps / 32 kHz / mono / no padding)
#   3 frame × 144 byte = 432 byte ≈ 0.108 sec silent
```

## P9 真资源生成命令（参考）

```bash
# 1. silent.wav 已可直接使用，无需替换

# 2. 派单铃声（设计师产出 ≥ 2 秒清脆叮咚提示音 mp3，替换 432B 占位）
ffmpeg -i source.wav -ar 44100 -ac 2 -b:a 96k -t 2.0 \
    src/static/audio/new-dispatch.mp3

# 3. 骑手图标 24×24 蓝点（外径 24px，内径 18px，#1890FF）
convert -size 24x24 xc:transparent \
    -fill "#1890FF" -draw "circle 12,12 12,3" \
    -fill "#FFFFFF" -draw "circle 12,12 12,7" \
    src/static/marker/marker-rider.png

# 4. 取件图标 32×32 橙色锚点
convert -size 32x32 xc:transparent \
    -fill "#FA8C16" -draw "polygon 16,4 28,16 22,28 16,22 10,28 4,16" \
    src/static/marker/marker-pickup.png

# 5. 送达图标 32×32 绿色锚点
convert -size 32x32 xc:transparent \
    -fill "#00B578" -draw "polygon 16,4 28,16 22,28 16,22 10,28 4,16" \
    src/static/marker/marker-deliver.png
```

## 校验方式

```bash
# 文件存在性 + 大小
Get-ChildItem 骑手端/src/static/ -Recurse -File | Format-Table Name, Length

# build 时无 missing-resource 警告
pnpm --filter 骑手端 build:h5

# MP3 header 校验（应输出 FF FB 18 C0 ...）
$bytes = [System.IO.File]::ReadAllBytes("骑手端/src/static/audio/new-dispatch.mp3")
'{0:X2} {1:X2} {2:X2} {3:X2}' -f $bytes[0],$bytes[1],$bytes[2],$bytes[3]
```

> P6 R1 / I-03 教训详见 `docs/P6_商户端开发/P6_COMPLETION_REPORT.md` §十三 I-03。
> P7 R1 / R-01 修复详见 `docs/P7_骑手端开发/P7_COMPLETION_REPORT.md` §十四。
