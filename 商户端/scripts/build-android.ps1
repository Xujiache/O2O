# ----------------------------------------------------------------------------
# O2O 商户端 Android APK 构建脚本（PowerShell）
# 对应：T6.48 iOS IPA & Android APK 构建脚本
# ----------------------------------------------------------------------------
# 用法：
#   ./商户端/scripts/build-android.ps1
#
# 前置条件：
#   1. HBuilderX CLI 已安装（C:\Program Files\HBuilderX\cli.exe）
#   2. 已在 HBuilderX 完成「云打包 → 生成正式签名」
#   3. nativePlugins/Mchnt-ForegroundService 已上传至 dcloud 云端
# ----------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path "$PSScriptRoot/..").Path
$DistDir = Join-Path $ProjectRoot 'dist/build/app'
$ApkOutput = Join-Path $ProjectRoot 'unpackage/release/apk'

Write-Host "[1/4] 清理旧产物..." -ForegroundColor Cyan
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
if (Test-Path $ApkOutput) { Remove-Item -Recurse -Force $ApkOutput }

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
  pnpm build:app-android
  if ($LASTEXITCODE -ne 0) { throw "build:app-android 失败" }
}
finally {
  Pop-Location
}

Write-Host "[4/4] 资源已就位，请在 HBuilderX 选择「发行 → 原生 APP-云打包」" -ForegroundColor Green
Write-Host "      Android APK 输出：$ApkOutput" -ForegroundColor Green
Write-Host ""
Write-Host "构建后请人工验收：" -ForegroundColor Yellow
Write-Host "  - APK 大小 ≤ 40MB（NFR-4）" -ForegroundColor Yellow
Write-Host "  - 真机安装后冷启动 ≤ 2.5s（NFR-1）" -ForegroundColor Yellow
Write-Host "  - 完成《保活方案.md》§2.3 验收清单" -ForegroundColor Yellow
