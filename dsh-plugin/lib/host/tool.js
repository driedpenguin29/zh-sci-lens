/**
 * 智能体工具：把生成好的报告交回面板。
 *
 * 这是「浏览器 → 模型 → 浏览器」闭环的最后一跳。面板创建 job 后由 host
 * 把作业说明 followup 给 root agent；agent 干完活调用本工具，报告落进 job，
 * 面板轮询到 done 就渲染。
 */
export function registerTool(ctx, { jobs, logger }) {
  const definition = {
    name: 'zh_sci_lens_submit',
    description:
      '双镜批注本：把生成好的报告提交给侧边栏面板。当你在处理【双镜批注本 · 自动任务】时，做完必须调用本工具，' +
      '只回文字面板拿不到结果。report 的字段见任务说明（title/byline/verdict/annots/rewrite/summary/facts/advice）。',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: '任务 id，来自任务说明里的 jobId。' },
        report: {
          type: 'object',
          description: '报告正文。缺哪个块就不写哪个块。',
          properties: {
            title: { type: 'string' },
            titleAccent: { type: 'string' },
            byline: { type: 'array', items: { type: 'string' } },
            verdict: { type: 'array', items: { type: 'string' } },
            annots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  i: { type: 'number' },
                  notes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        n: { type: 'number' },
                        tag: { type: 'string' },
                        quote: { type: 'string', description: '原文里要标出的片段，逐字摘录。' },
                        text: { type: 'string' },
                      },
                      required: ['n', 'text'],
                    },
                  },
                },
                required: ['i', 'notes'],
              },
            },
            rewrite: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  paras: { type: 'array', items: { type: 'string' } },
                  why: { type: 'array', items: { type: 'string' } },
                },
                required: ['paras'],
              },
            },
            summary: { type: 'array', items: { type: 'string' } },
            facts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  claim: { type: 'string' },
                  verdict: { type: 'string' },
                  kind: { type: 'string' },
                  basis: { type: 'string' },
                },
                required: ['claim', 'verdict', 'basis'],
              },
            },
            advice: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  t: { type: 'string' },
                  body: { type: 'string' },
                  how: { type: 'string' },
                },
                required: ['t', 'body'],
              },
            },
          },
          additionalProperties: true,
        },
      },
      required: ['jobId', 'report'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
    },
    async execute(args) {
      const jobId = String(args?.jobId || '').trim()
      const report = args?.report
      if (!jobId) return { text: '提交失败：缺少 jobId。' }
      if (!report || typeof report !== 'object') return { text: '提交失败：report 不是对象。' }

      const job = await jobs.get(jobId)
      if (!job) return { text: `提交失败：找不到任务 ${jobId}（可能已被清理）。` }

      // 守卫：note 编号与数量对不上时提醒一次，但不拦——模型可能有意合并。
      const notes = Array.isArray(report.annots)
        ? report.annots.reduce((s, a) => s + (Array.isArray(a?.notes) ? a.notes.length : 0), 0)
        : 0
      const ns = Array.isArray(report.annots)
        ? report.annots.flatMap((a) => (Array.isArray(a?.notes) ? a.notes.map((n) => n?.n) : []))
        : []
      const dup = ns.length !== new Set(ns).size

      await jobs.patch(jobId, { status: 'done', report, error: null })
      logger?.('report submitted', jobId, notes, 'notes')

      const warn = dup ? '\n注意：notes 的编号有重复，页面上可能与正文标号对不上。' : ''
      return {
        text: `报告已提交给面板（jobId ${jobId}，${notes} 条批注）。${warn}\n用户可以在侧边栏「双镜批注本」里看到，并导出成 HTML。`,
      }
    },
  }

  if (ctx.tools?.register) {
    const dispose = ctx.tools.register(definition)
    ctx.effect(() => dispose, 'zh-sci-lens: tool zh_sci_lens_submit')
    return
  }
  ctx.inject(['tools'], (toolCtx) => {
    const dispose = toolCtx.tools.register(definition)
    toolCtx.effect(() => dispose, 'zh-sci-lens: tool zh_sci_lens_submit')
  })
}
