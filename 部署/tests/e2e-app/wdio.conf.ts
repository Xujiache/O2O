import type { Options } from '@wdio/types'

/**
 * O2O 商户端 / 骑手端 APP E2E — WebdriverIO + Appium
 * Sprint 4 / W4.E.2
 *
 * 双 capability：android (UiAutomator2) + ios (XCUITest)
 * 默认通过 --capabilities android|ios 在 cli 选择子集，未指定则两个都跑。
 */

type CapWithName = WebdriverIO.Capabilities & { 'wdio:name'?: string }

const APP_ANDROID = process.env.APP_ANDROID_PATH || './apps/merchant-debug.apk'
const APP_IOS = process.env.APP_IOS_PATH || './apps/Merchant.app'
const ANDROID_DEVICE = process.env.ANDROID_DEVICE_NAME || 'emulator-5554'
const IOS_DEVICE = process.env.IOS_DEVICE_NAME || 'iPhone 15 Simulator'
const IOS_PLATFORM_VERSION = process.env.IOS_PLATFORM_VERSION || '17.0'
const ANDROID_PLATFORM_VERSION = process.env.ANDROID_PLATFORM_VERSION || '13'

const androidCap: CapWithName = {
  platformName: 'Android',
  'appium:platformVersion': ANDROID_PLATFORM_VERSION,
  'appium:deviceName': ANDROID_DEVICE,
  'appium:automationName': 'UiAutomator2',
  'appium:app': APP_ANDROID,
  'appium:autoGrantPermissions': true,
  'appium:newCommandTimeout': 240,
  'wdio:name': 'android'
}

const iosCap: CapWithName = {
  platformName: 'iOS',
  'appium:platformVersion': IOS_PLATFORM_VERSION,
  'appium:deviceName': IOS_DEVICE,
  'appium:automationName': 'XCUITest',
  'appium:app': APP_IOS,
  'appium:newCommandTimeout': 240,
  'wdio:name': 'ios'
}

const cliFlag: string | undefined = process.argv
  .find((a: string): boolean => a.startsWith('--capabilities='))
  ?.split('=')[1]

let capabilities: CapWithName[] = [androidCap, iosCap]
if (cliFlag === 'android') capabilities = [androidCap]
if (cliFlag === 'ios') capabilities = [iosCap]

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: './tsconfig.json'
    }
  },
  specs: ['./tests/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,
  capabilities,
  logLevel: (process.env.WDIO_LOG_LEVEL as Options.WebDriverLogTypes) || 'info',
  bail: 0,
  baseUrl: process.env.E2E_API_BASE || 'http://localhost:3001',
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  services: [
    [
      'appium',
      {
        args: { address: '127.0.0.1', port: 4723, relaxedSecurity: true },
        command: 'appium'
      }
    ]
  ],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000
  }
}
