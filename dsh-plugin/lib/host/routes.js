/**
 * zh-sci-lens · Host HTTP API
 *
 * 这个面板要做的事，浏览器一个人做不到的是「叫得动模型」，其余都能自己做：
 *   - 打分、控件、闸门：client.js 内联了 SLX 引擎，全部本地实算；
 *   - 报告的排版与导出：客户端渲染 + Blob 下载，不需要服务端画图。
 * 所以这里只有四条：
 *   GET  /health     工作区与状态
 *   GET  /jobs       最近任务
 *   POST /generate   建 job，后台直接调模型生成
 *   GET  /job?id=    轮询任务（面板等 done）
 */
import { buildPrompt, SYSTEM } from './prompt.js'
import { callJson } from './llm.js'
import { detect, buildFixPrompt, merge, normalizeTags } from './polish.js'

const PREFIX = '/api/zh-sci-lens'

function sendJson(res, status, value) {
  if (res.headersSent) return
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function sendError(res, status, error) {
  sendJson(res, status, { ok: false, error: error instanceof Error ? error.message : String(error || '未知错误') })
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大（上限 4 MB）')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

export function registerRoutes(ctx, options) {
  const { jobs, resolveWorkspace, logger, version, llm, model } = options

  const route = (pathname, handler) => {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'exact',
          path: pathname,
          handler: async (req, res) => {
            try {
              await handler(req, res)
            } catch (error) {
              logger?.('route error', pathname, error?.message)
              sendError(res, 500, error)
            }
          },
        }),
      `zh-sci-lens: route ${pathname}`,
    )
  }

  route(`${PREFIX}/health`, async (req, res) => {
    const workspace = resolveWorkspace()
    let ready = false
    let modelName = null
    try {
      const sel = model?.()
      modelName = sel ? `${sel.provider}/${sel.model}` : null
      ready = Boolean(sel && llm && typeof llm.stream === 'function')
    } catch {
      ready = false
    }
    sendJson(res, 200, { ok: true, version, workspace, model: modelName, llmReady: ready })
  })

  route(`${PREFIX}/jobs`, async (req, res) => {
    sendJson(res, 200, { ok: true, jobs: await jobs.list(20) })
  })

  route(`${PREFIX}/job`, async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const id = url.searchParams.get('id')
    if (!id) return sendError(res, 400, '缺少 id')
    const job = await jobs.get(id)
    if (!job) return sendError(res, 404, '任务不存在')
    sendJson(res, 200, { ok: true, job })
  })

  route(`${PREFIX}/generate`, async (req, res) => {
    if (req.method !== 'POST') return sendError(res, 405, '只接受 POST')
    const body = await readBody(req)
    const text = String(body?.text || '').trim()
    const mode = String(body?.mode || '').trim()
    const metrics = body?.metrics ?? null
    if (!text) return sendError(res, 400, '文本为空')
    if (mode !== 'rig' && mode !== 'pop') return sendError(res, 400, 'mode 只能是 rig 或 pop')

    const sel = (() => {
      try {
        return model?.() ?? null
      } catch {
        return null
      }
    })()
    if (!sel || !llm || typeof llm.stream !== 'function') {
      return sendError(res, 503, '当前没有可用的默认模型。请在会话里选一个模型后重试。')
    }

    const job = await jobs.create({ text, mode, metrics })
    await jobs.patch(job.id, { status: 'working', startedAt: new Date().toISOString() })

    // 立刻返回 jobId，生成在后台跑；面板轮询 /job。
    ;(async () => {
      const debug = []
      try {
        // 模型偶尔只吐「思考」不吐正文，或者把 JSON 写坏；重试一次通常就好了。
        let report = null
        let lastError = null
        // 第一次给 16k；空文本/被截断时第二次翻到 32k。
        // 推理模型会先把预算花在思考上，长报告 12k 不够——实测就栽在这里。
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const budget = attempt === 1 ? 16000 : 32000
          try {
            report = await callJson({
              llm,
              model: sel,
              system: SYSTEM,
              prompt:
                buildPrompt({ mode, text, metrics }) +
                (attempt > 1
                  ? '\n\n（上一轮你把生成预算花在了思考上，没有留下正文。这一轮请先直接把 JSON 写出来，不要再复述规则。）'
                  : ''),
              timeoutMs: attempt === 1 ? 180_000 : 240_000,
              maxTokens: budget,
              logger,
              debug,
            })
            break
          } catch (error) {
            lastError = error
            debug.push('attempt ' + attempt + ' failed (maxTokens ' + budget + '): ' + String(error?.message || error))
            logger?.('attempt failed', attempt, error?.message)
          }
        }
        if (!report) throw lastError || new Error('生成失败')

        // 行话清扫：提示词里禁了，模型仍会写。命中就只把命中的句子发回去换人话。
        // 没有命中就一次额外调用都不发；tag 无论如何都归一到白名单。
        try {
          const hits = detect(report)
          if (hits.length) {
            debug.push('jargon hits: ' + hits.length)
            const fixed = await callJson({
              llm,
              model: sel,
              system: '你是一位中文编辑，只做一件事：把行话换成人话，意思一点不变。只输出 JSON。',
              prompt: buildFixPrompt(hits),
              timeoutMs: 90_000,
              maxTokens: 4000,
              logger,
              debug,
            })
            report = merge(report, fixed)
            const left = detect(report)
            if (left.length) debug.push('jargon left: ' + left.length)
          }
        } catch (error) {
          // 清扫失败不影响主报告：宁可留一句行话，也不要让整份报告失败。
          debug.push('polish failed: ' + String(error?.message || error))
        }
        // summary 是五块面板之一，模型偶尔会整个键都不写（把那句"没有的块就省略"
        // 当成了许可证）。这里单独补一次：只让它写 3–5 条，输出很小，比整份重跑便宜得多。
        if (!Array.isArray(report.summary) || report.summary.length === 0) {
          try {
            const fix = await callJson({
              llm,
              model: sel,
              system: SYSTEM,
              prompt:
                '上一版报告漏了「内容总结」。请只补这一块：\n' +
                '用 3–5 条讲清楚这段文字到底在说什么——这件事是什么、为什么会这样、谁做了什么、结果是多少；' +
                '允许打一个比方，比方的下一句要写清它哪里不成立。不要以「作者想讲的是」开头。\n' +
                '只输出 {"summary": ["…", "…"]}，不要别的键。\n\n原文：\n' +
                String(text),
              timeoutMs: 120_000,
              maxTokens: 6000,
              logger,
              debug,
            })
            if (fix && Array.isArray(fix.summary) && fix.summary.length) report.summary = fix.summary
          } catch (error) {
            debug.push('summary repair failed: ' + String(error?.message || error))
          }
        }

        report = normalizeTags(report)

        await jobs.patch(job.id, { status: 'done', report, finishedAt: new Date().toISOString() })
        logger?.('job done', job.id, mode)
      } catch (error) {
        logger?.('job failed', job.id, error?.message)
        await jobs.patch(job.id, {
          status: 'error',
          error: String(error?.message || error),
          raw: error?.raw ? String(error.raw).slice(0, 4000) : null,
          errorDebug: debug.length ? debug : null,
        })
      }
    })()

    sendJson(res, 200, { ok: true, jobId: job.id, model: `${sel.provider}/${sel.model}` })
  })

  logger?.('routes ready', PREFIX)
}
