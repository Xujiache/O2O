# 骑手端静态资源说明

> 本目录已规避 P6-R1 / I-03 教训：所有外部引用资源 **必须真实存在文件**（哪怕 0 字节占位），
> 否则 build 阶段 vite-plugin-uni 报 missing-resource，运行期 audioCtx / image 加载报 404。

## 当前占位文件

| 资源                        | 大小    | 用途                                                                                               | 状态          |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `audio/silent.wav`          | 45 字节 | iOS 静音音频保活（`startSilentAudio`），mono 8kHz 8-bit 1 sample silence —— **可直接用于 P9 灰度** | ✅ 真有效 WAV |
| `audio/new-dispatch.mp3`    | 0 字节  | 派单铃声循环（`startRingtone`），`audioCtx.onError` 已兜底；P9 替换为 1-2 秒提示音 mp3             | ⚠️ 0 字节占位 |
| `marker/marker-rider.png`   | 67 字节 | 内置地图骑手当前位置图标，1×1 透明 PNG                                                             | ⚠️ 占位 PNG   |
| `marker/marker-pickup.png`  | 67 字节 | 内置地图取件点图标                                                                                 | ⚠️ 占位 PNG   |
| `marker/marker-deliver.png` | 67 字节 | 内置地图送达点图标                                                                                 | ⚠️ 占位 PNG   |

## P9 真资源生成命令（参考）

```bash
# 1. silent.wav 已可直接使用，无需替换

# 2. 派单铃声（1.5 秒清脆叮咚）
ffmpeg -i source.wav -ar 44100 -ac 2 -b:a 96k -t 1.5 \
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
# 文件存在性
Get-ChildItem src/static/ -Recurse -File

# build 时无 missing-resource 警告
pnpm --filter 骑手端 build:h5
```

> P6 R1 / I-03 教训详见 `docs/P6_商户端开发/P6_COMPLETION_REPORT.md` §十三 I-03。
