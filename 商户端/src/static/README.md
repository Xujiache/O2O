# 商户端 静态资源

> P6 商户端 / R1 修复 I-03  
> 本目录占位资源由 R1 阶段创建，**真实资源待 P9 集成测试部署阶段补齐**

## 资源清单

| 文件                  | 用途                                     | 当前状态                                                     | P9 真资源要求                          |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `audio/new-order.mp3` | 新订单铃声（NewOrderModal 循环播放）     | **0 字节空占位**（解码会失败但 `audioCtx.onError` 兜底）     | 1-2 秒提示音 ≤ 50KB，单声道 44.1kHz    |
| `audio/silent.wav`    | iOS 静音音频保活（`startSilentAudio()`） | **45 字节最小有效 WAV**（mono 8kHz 8-bit, 1 sample silence） | 推荐 1 秒 0 分贝，可直接复用 R1 占位   |
| `marker-dot.png`      | PolygonEditor 配送范围顶点 marker        | **67 字节最小有效 1×1 透明 PNG**                             | 24×24px 蓝点 png ≤ 1KB（颜色 #2F80ED） |

## 构建保证

- 所有 3 个文件均存在，`pnpm build:mp-weixin` 不会报 missing-resource 错误
- 加载失败时业务代码已在 `ringtone.ts` `audioCtx.onError`、`BizPolygonEditor.vue` 等处兜底（不致命）

## P9 替换指引

```bash
# 1) silent.wav 已经是有效 WAV，可直接复用，无需替换
# 2) new-order.mp3 用 ffmpeg 生成提示音：
ffmpeg -f lavfi -i "sine=frequency=880:duration=1.5" -c:a libmp3lame -b:a 64k new-order.mp3
# 3) marker-dot.png 用 ImageMagick 或 Figma 设计 24×24 蓝点
convert -size 24x24 xc:transparent -fill "#2F80ED" -draw "circle 12,12 12,4" marker-dot.png
```

> 维护人：单 Agent V2.0 (P6 商户端 / R1 / I-03)
