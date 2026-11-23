/**
 * 任务存储：一次「输入文本 → 出报告」就是一条 job。
 *
 * 为什么落盘而不只放内存：
 *   - 报告生成由模型完成，可能要几十秒到几分钟，页面刷新不能把任务弄丢；
 *   - 用户可能同时开两个会话，内存单例会串。
 *
 * 目录：<工作区>/.zh-sci-lens/jobs/<id>.json
 */
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'

let seq = 0

function newId() {
  seq += 1
  const stamp = Date.now().toString(36)
  return `j${stamp}${seq.toString(36)}${randomUUID().slice(0, 4)}`
}

export function createJobStore(baseDir) {
  const dir = () => path.join(baseDir(), 'jobs')
  const file = (id) => path.join(dir(), `${String(id).replace(/[^a-zA-Z0-9]/g, '')}.json`)

  async function write(job) {
    await fsp.mkdir(dir(), { recursive: true })
    await fsp.writeFile(file(job.id), JSON.stringify(job, null, 2), 'utf8')
    return job
  }

  return {
    /** 新建一条待处理任务。text 只在生成期需要，报告出来后保留以便「重跑」。 */
    async create({ text, mode, sessionId }) {
      const job = {
        id: newId(),
        createdAt: new Date().toISOString(),
        status: 'queued',
        mode,
        text,
        chars: Array.from(String(text).replace(/\s/g, '')).length,
        sessionId: sessionId || null,
        delivered: null,
        error: null,
        report: null,
      }
      return write(job)
    },

    async get(id) {
      try {
        const raw = await fsp.readFile(file(id), 'utf8')
        return JSON.parse(raw)
      } catch {
        return null
      }
    },

    async patch(id, fields) {
      const job = await this.get(id)
      if (!job) return null
      return write({ ...job, ...fields })
    },

    /** 最近的若干条，最新在前；列表页只用得到摘要。 */
    async list(limit = 20) {
      try {
        const names = await fsp.readdir(dir())
        const out = []
        for (const name of names.filter((n) => n.endsWith('.json'))) {
          try {
            const job = JSON.parse(await fsp.readFile(path.join(dir(), name), 'utf8'))
            out.push({
              id: job.id,
              createdAt: job.createdAt,
              status: job.status,
              mode: job.mode,
              chars: job.chars,
              title: job.report?.title?.replace(/<[^>]+>/g, '') || null,
            })
          } catch {
            /* 单条坏掉不影响整个列表 */
          }
        }
        return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit)
      } catch {
        return []
      }
    },
  }
}
