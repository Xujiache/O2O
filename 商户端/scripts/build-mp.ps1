# ----------------------------------------------------------------------------
# O2O 商户端 微信小程序 构建脚本（PowerShell）
# 对应：T6.47 小程序简化版适配 + T6.48 构建脚本
# ----------------------------------------------------------------------------
# 用法：
#   ./商户端/scripts/build-mp.ps1
#
# 前置条件：
#   1. node ≥ 20.19.0 / pnpm ≥ 8.8.0
#   2. 已申请微信小程序 appid，并填到 商户端/src/manifest.json mp-weixin.appid
#   3. 微信开发者工具已安装（用于上传体验版）
#
# 注意：
#   - 小程序版自动跳过：蓝牙打印 / Foreground Service / iOS 静音保活
#   - TTS 降级为 vibrate + toast
#   - 包大小限制：主包 ≤ 2MB / 总包 ≤ 20MB
# ----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path "$PSScriptRoot/..").Path
$DistDir = Join-Path $ProjectRoot 'dist/build/mp-weixin'

Write-Host "[1/4] 清理旧产物..." -ForegroundColor Cyan
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }

Write-Host "[2/4] 类型检查 + lint..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
  pnpm type-check
  if ($LASTEXITCODE -ne 0) { throw "type-check 失败" }
  pnpm lint:check
  if ($LASTEXITCODE -ne 0) { throw "lint:check 失败" }
}
finally {
  Pop-Location
}

Write-Host "[3/4] 构建 mp-weixin..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
  pnpm build:mp-weixin
  if ($LASTEXITCODE -ne 0) { throw "build:mp-weixin 失败" }
}
finally {
  Pop-Location
}

Write-Host "[4/4] 检查产物大小..." -ForegroundColor Cyan
if (Test-Path $DistDir) {
  $totalSize = (Get-ChildItem -Path $DistDir -Recurse | Measure-Object -Property Length -Sum).Sum
  $totalMb = [math]::Round($totalSize / 1MB, 2)
  Write-Host "  总包大小：$totalMb MB" -ForegroundColor $(if ($totalMb -lt 14) { 'Green' } else { 'Red' })

  Get-ChildItem -Path $DistDir -Directory | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse | Measure-Object -Property Length -Sum).Sum
    Write-Host "    - $($_.Name): $([math]::Round($size/1KB, 1)) KB" -ForegroundColor Gray
  }
}

Write-Host ""
Write-Host "构建完成。下一步：" -ForegroundColor Green
Write-Host "  1. 打开微信开发者工具" -ForegroundColor Green
Write-Host "  2. 导入项目目录：$DistDir" -ForegroundColor Green
Write-Host "  3. 上传体验版（菜单 → 上传）" -ForegroundColor Green
