# ----------------------------------------------------------------------------
# O2O 商户端 iOS IPA 构建脚本（PowerShell）
# 对应：T6.48 iOS IPA & Android APK 构建脚本
# ----------------------------------------------------------------------------
# 用法：
#   ./商户端/scripts/build-ios.ps1
#
# 前置条件：
#   1. HBuilderX CLI 已安装
#   2. 已配置 iOS 证书（开发证书 + 描述文件 / TestFlight）
#   3. nativePlugins 已上传 dcloud 云端
# ----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path "$PSScriptRoot/..").Path
$DistDir = Join-Path $ProjectRoot 'dist/build/app'
$IpaOutput = Join-Path $ProjectRoot 'unpackage/release/ios'

Write-Host "[1/4] 清理旧产物..." -ForegroundColor Cyan
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
if (Test-Path $IpaOutput) { Remove-Item -Recurse -Force $IpaOutput }

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

Write-Host "[3/4] 构建 app 资源..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
  pnpm build:app-ios
  if ($LASTEXITCODE -ne 0) { throw "build:app-ios 失败" }
}
finally {
  Pop-Location
}

Write-Host "[4/4] 资源已就位，请在 HBuilderX 选择「发行 → 原生 APP-云打包 → iOS」" -ForegroundColor Green
Write-Host "      iOS IPA 输出：$IpaOutput" -ForegroundColor Green
Write-Host ""
Write-Host "构建后请人工验收：" -ForegroundColor Yellow
Write-Host "  - IPA 大小 ≤ 60MB（NFR-5）" -ForegroundColor Yellow
Write-Host "  - 13.0+ 真机冷启动 ≤ 2.5s（NFR-1）" -ForegroundColor Yellow
Write-Host "  - 完成《保活方案.md》§3.6 验收清单（≥ 80% 成功率）" -ForegroundColor Yellow
