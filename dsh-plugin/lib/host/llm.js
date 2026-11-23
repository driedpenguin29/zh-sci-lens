/**
 * 直接调模型的薄封装。
 *
 * 为什么不用 agent.followup：桌面版里会话 agent 不一定与插件同进程，
 * `ctx.agents.roots()` 常常是空的。`ctx.llm` 是稳定的，所以报告由插件自己生成。
 *
 * 只做三件事：把流拼成文本、把超时/取消合成一个 AbortController、把文本当 JSON 解析。
 */

/** 报告较长（10 段批注 + 全文改写 + 建议），给足时间。 */
export const DEFAULT_TIMEOUT_MS = 180_000

export function abortError(message = '已取消') {
  const e = new Error(message)
  e.name = 'AbortError'
  e.aborted = true
  return e
}

/** 从可能带 ```json 围栏的文本里取出 JSON。 */
export function parseJson(text) {
  if (!text || typeof text !== 'string') throw new Error('模型返回空文本')
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  // 有些模型会在 JSON 前后加一句话，取第一个 { 到最后一个 }
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a > 0 || (b >= 0 && b < s.length - 1)) {
    if (a >= 0 && b > a) s = s.slice(a, b + 1)
  }
  try {
    return JSON.parse(s)
  } catch (error) {
    // 模型写坏 JSON 的常见几种：字符串里有真换行、尾逗号、被截断。挨个补救一次。
    for (const fixed of repairCandidates(s)) {
      try {
        return JSON.parse(fixed)
      } catch {
        /* 继续下一个候选 */
      }
    }
    const e = new Error('模型返回的不是合法 JSON：' + String(error && error.message ? error.message : error))
    e.raw = text.slice(0, 4000)
    throw e
  }
}


/** 把字符串字面量里未转义的换行 / 制表符转义掉。逐字符扫，只在引号内动手。 */
function escapeControls(src) {
  let out = ''
  let inStr = false
  let esc = false
  for (const ch of src) {
    if (esc) {
      out += ch
      esc = false
      continue
    }
    if (ch === '\\') {
      out += ch
      esc = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      out += ch
      continue
    }
    if (inStr && ch === '\n') {
      out += '\\n'
      continue
    }
    if (inStr && ch === '\r') continue
    if (inStr && ch === '\t') {
      out += '\\t'
      continue
    }
    out += ch
  }
  return out
}

/** 去掉 } 或 ] 前面多余的逗号。 */
function dropTrailingCommas(src) {
  return src.replace(/,\s*([}\]])/g, '$1')
}

/** 被截断时，补齐还没闭合的字符串与括号。 */
function closeOpen(src) {
  let inStr = false
  let esc = false
  const stack = []
  for (const ch of src) {
    if (esc) {
      esc = false
      continue
    }
    if (ch === '\\') {
      esc = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let tail = inStr ? '"' : ''
  for (let i = stack.length - 1; i >= 0; i -= 1) tail += stack[i] === '{' ? '}' : ']'
  return src + tail
}

function repairCandidates(src) {
  const list = []
  const a = escapeControls(src)
  list.push(dropTrailingCommas(a))
  list.push(dropTrailingCommas(closeOpen(a)))
  // 截断前把最后一个不完整的键值对砍掉，再补齐
  const cut = a.slice(0, a.lastIndexOf(','))
  list.push(dropTrailingCommas(closeOpen(cut)))
  return list
}

/** 把 chunk 流拼成文本；error/aborted 结束块转成异常。 */
async function collect(stream, signal, onDelta, debug) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new Error('LLM 返回了不可迭代的流')
  const it = stream[Symbol.asyncIterator]()
  let text = ''
  let finish = null
  for (;;) {
    if (signal?.aborted) throw abortError()
    const step = await it.next()
    if (step.done) break
    const chunk = step.value
    if (!chunk || typeof chunk !== 'object') continue
    if (debug && debug.length < 12) {
      try {
        debug.push(String(chunk.type || '?') + ':' + JSON.stringify(chunk).slice(0, 160))
      } catch {
        debug.push(String(chunk.type || '?'))
      }
    }
    if (chunk.type === 'text-delta') {
      if (typeof chunk.text === 'string') {
        text += chunk.text
        if (typeof onDelta === 'function') {
          try {
            onDelta(chunk.text)
          } catch {
            /* 展示回调失败不得中断生成 */
          }
        }
      }
    } else if (chunk.type === 'block-end') {
      if (!text && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') text += chunk.block.text
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason
      finish = reason || null
      if (reason?.kind === 'error') throw new Error(reason.failure?.message || 'LLM 调用失败')
      if (reason?.kind === 'aborted') throw abortError(reason.failure?.message || 'LLM 调用被中断')
    }
  }
  return { text, finish }
}

/**
 * 调一次模型并返回文本。
 * @param {object} opts {llm, model, system, prompt, timeoutMs, maxTokens, onDelta, signal}
 */
export async function callText({ llm, model, system, prompt, timeoutMs, maxTokens, onDelta, signal, logger, debug }) {
  if (!llm || typeof llm.stream !== 'function') throw new Error('LLM 服务不可用')
  if (!model || !model.provider || !model.model) throw new Error('没有默认模型（agentDefaultModel 未选）')

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      controller.abort(new Error('LLM 超时'))
    } catch {
      /* ignore */
    }
  }, Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS)

  const onAbort = () => {
    try {
      controller.abort(abortError())
    } catch {
      /* ignore */
    }
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const payload = {
      provider: model.provider,
      model: model.model,
      ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      signal: controller.signal,
      ...(Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? { maxTokens: Math.round(Number(maxTokens)) } : {}),
    }
    const stream = llm.stream(payload)
    const { text, finish } = await collect(stream, controller.signal, onDelta, debug)
    const trimmed = String(text || '').trim()
    if (!trimmed) {
      // 两种空：模型把预算全花在思考上（finish=length），或者干脆没吐。
      // 分开报，用户才知道该缩短文本还是直接重试。
      const starved = finish && finish.kind === 'length'
      const e = new Error(
        starved
          ? '模型把生成预算用完了（到 maxTokens 上限），没剩下正文。重试一次通常就好；再不行就把文本缩到十段以内。'
          : 'LLM 返回空文本',
      )
      e.empty = true
      e.starved = Boolean(starved)
      e.finish = finish
      e.raw = debug ? debug.join('\n') : null
      throw e
    }
    return trimmed
  } catch (error) {
    if (timedOut) throw new Error(`生成超时（${Math.round((Number(timeoutMs) || DEFAULT_TIMEOUT_MS) / 1000)}s），可重试或缩短文本`)
    throw error
  } finally {
    clearTimeout(timer)
    if (signal) {
      try {
        signal.removeEventListener('abort', onAbort)
      } catch {
        /* ignore */
      }
    }
  }
}

/** 调一次模型并要求返回 JSON。 */
export async function callJson(opts) {
  const text = await callText(opts)
  try {
    return parseJson(text)
  } catch (error) {
    opts?.logger?.('json parse failed, head:', String(text).slice(0, 200))
    throw error
  }
}
