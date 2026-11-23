#!/usr/bin/env node
/**
 * 生成 client.js。
 *
 * 为什么要这一步：引擎的**唯一真相**是 skill 里的
 * `~/.dsh/skills/zh-sci-lens/templates/engine.js`，
 * 而浏览器产物必须是一个自包含文件（宿主按包原样读取，没有模块解析）。
 * 所以这里把 SLX 那段 IIFE 抠出来，内联进 src/client.ui.js 的占位符。
 *
 * 用法：node build.mjs [--engine <path>] [--check]
 *   --check  只比对，不写文件；不一致时退出码 1（供 CI / 同步脚本使用）
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const here = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_ENGINE = path.join(
  os.homedir(),
  '.dsh/skills/zh-sci-lens/templates/engine.js',
)

const args = process.argv.slice(2)
const enginePath = (() => {
  const i = args.indexOf('--engine')
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : DEFAULT_ENGINE
})()
const checkOnly = args.includes('--check')

/**
 * 从 engine.js 里抠出 `const SLX = (function(){ … })();`
 *
 * 同时把 ORIG_PARAS 清空：那是夹具默认文本（某人的作业段落），
 * 不该随插件分发；插件的正文来自用户粘贴或 spec.source。
 */
function extractEngine(source) {
  const start = source.indexOf('const SLX = (function(){')
  if (start < 0) throw new Error('engine.js 里找不到 `const SLX = (function(){`')
  const endMarker = '\n})();'
  const end = source.indexOf(endMarker, start)
  if (end < 0) throw new Error('engine.js 里找不到 SLX 的闭合 `})();`')
  let block = source.slice(start, end + endMarker.length)
  const before = block
  block = block.replace(/^const ORIG_PARAS = .*$/m, 'const ORIG_PARAS = [];')
  if (block === before) {
    console.warn('[build] 警告：没找到单行 ORIG_PARAS，夹具默认文本可能被打包进来')
  }
  return block
}

const [template, engineSource] = await Promise.all([
  readFile(path.join(here, 'src/client.ui.js'), 'utf8'),
  readFile(enginePath, 'utf8'),
])

const engineBlock = extractEngine(engineSource)
const MARKER = '/*__SLX_ENGINE__*/'
if (!template.includes(MARKER)) throw new Error(`client.ui.js 里找不到占位符 ${MARKER}`)

const out = template.replace(MARKER, () => engineBlock)
const target = path.join(here, 'client.js')

if (checkOnly) {
  let current = ''
  try {
    current = await readFile(target, 'utf8')
  } catch {
    console.error('[build] client.js 不存在；先跑一次 node build.mjs')
    process.exit(1)
  }
  if (current !== out) {
    console.error('[build] client.js 与引擎源不一致；跑 node build.mjs 重新生成')
    process.exit(1)
  }
  console.log('[build] client.js 已是最新')
  process.exit(0)
}

await writeFile(target, out, 'utf8')
console.log(`[build] client.js 已生成（${out.length} 字节，引擎源 ${path.basename(enginePath)}）`)
