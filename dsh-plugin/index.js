/**
 * zh-sci-lens · Host 入口
 *
 * 插件做三件事：
 *   1. 把「文本 → 报告」这条链路接起来：面板建 job，host 把作业说明交给 root agent，
 *      agent 干完调用 zh_sci_lens_submit 交回来，面板轮询到就渲染；
 *   2. 给出四条 HTTP 路由（健康 / 任务列表 / 建任务 / 轮询任务）；
 *   3. 集中判定一次「工作区在哪」，任务文件落在 <工作区>/.zh-sci-lens/jobs/。
 *
 * 引擎与排版全在浏览器里跑（client.js 内联 SLX + 自带渲染），host 不 spawn 任何进程。
 */
import os from 'node:os'
import path from 'node:path'
import { createJobStore } from './lib/host/jobs.js'
import { registerRoutes } from './lib/host/routes.js'
import { registerTool } from './lib/host/tool.js'

export const name = 'dsh-zh-sci-lens'

// 必须在这里声明——未 inject 的 ctx 属性读取会直接抛「cannot get property ... without inject」。
//   webServer        四条 HTTP 路由
//   tools            zh_sci_lens_submit（让会话里的 agent 也能手工提交报告）
//   llm              直接调模型生成报告（不依赖会话 agent 同进程）
//   agentDefaultModel 读当前默认 provider/model
export const inject = ['webServer', 'tools', 'llm', 'agentDefaultModel']

export const VERSION = '0.3.0'

export const DEFAULT_CONFIG = {
  /** 任务目录；空 = <工作区>/.zh-sci-lens */
  jobDir: '',
}

/**
 * 解析当前工作区根目录。
 *
 * 桌面版 `workingDirectory.defaultDirectory` 指向 profile 目录，不是项目目录，
 * 所以先问真实 root agent，再退到 workspaceRegistry，最后才用 defaultDirectory。
 */
export function resolveWorkspace(ctx) {
  const wd = ctx.get('workingDirectory')
  try {
    const roots = ctx.get('agents')?.roots?.() ?? []
    for (const agent of roots) {
      const id = agent?.session?.id ?? agent?.id
      const dir = id ? wd?.get?.(agent.session ?? { id }) : undefined
      if (dir && String(dir).trim()) return String(dir)
    }
  } catch {
    /* fall through */
  }
  try {
    const workspaces = ctx.get('workspaceRegistry')?.list?.() ?? []
    const ws = workspaces.find((item) => item && typeof item.path === 'string' && item.path.trim())
    if (ws) return String(ws.path)
  } catch {
    /* fall through */
  }
  const dir = wd?.defaultDirectory
  return dir && String(dir).trim() ? String(dir) : process.cwd()
}

export function apply(ctx, rawConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) }
  const logger = (...args) => {
    try {
      ctx.logger?.info?.('[zh-sci-lens]', ...args)
    } catch {
      /* logging must never break the plugin */
    }
  }

  /**
   * 任务落盘位置。桌面版解析出来的「工作区」有时是 `/`（没有项目目录），
   * 往根目录写会失败，所以这种时候退到 $DSH_HOME 下的固定目录。
   */
  const baseDir = () => {
    const raw = String(resolveWorkspace(ctx) || '').trim()
    const unusable = !raw || raw === '/' || raw === path.parse(raw).root
    const base = unusable ? path.join(os.homedir(), '.dsh') : raw
    const custom = config.jobDir && String(config.jobDir).trim()
    return custom ? path.resolve(base, String(config.jobDir).trim()) : path.join(base, 'zh-sci-lens')
  }

  // 路由与工具共用同一个 store，所以在这里建一次。
  const jobs = createJobStore(baseDir)

  registerTool(ctx, { jobs, logger })

  ctx.inject(['webServer'], (webCtx) => {
    registerRoutes(webCtx, {
      jobs,
      config,
      version: VERSION,
      // 用外层 ctx 取 llm / 默认模型：webCtx 没有 inject 它们，读不到。
      llm: (() => {
        try {
          return ctx.llm
        } catch {
          return null
        }
      })(),
      model: () => {
        try {
          const sel = ctx.agentDefaultModel?.currentSelection?.()
          if (!sel || !sel.provider || !sel.model) return null
          return { provider: sel.provider, model: sel.model, reasoningEffort: sel.reasoningEffort }
        } catch {
          return null
        }
      },
      resolveWorkspace: () => resolveWorkspace(ctx),
      logger,
    })
  })
}
