/**
 * 行话清扫器。
 *
 * 提示词里写「不许用行话」是不够的：模型仍然会写「机制后置」「归因过强」这类词，
 * 因为在讨论这类文章时，这就是它最顺手的说法。所以这里做两件事：
 *
 * 1. detect()  在报告的自由文本里扫一遍禁词，列出命中的字段；
 * 2. fix()     只把这些字段发给模型，要求逐条换成人话，返回 {key: 新文本} 再合并回去。
 *
 * 只改被判定的那几个字符串，绝不重发 quote / paras，避免把已经对齐的标注搞乱。
 * 没有命中就一次额外调用都不发。
 */

/* 这些词是给读报告的人看的，不是给写报告的人用的。命中即修。 */
export const BANNED = [
  '断言强度', '后置定语', '名词化', '语域', '机制句', '逻辑主语', '量化断言',
  '元语言', '修辞遮蔽', '信息密度', '语篇', '衔接', '指代', '限定语', '模态',
  '命题', '绝对化表述', '论述层次', '程度失据', '归因过强', '机制后置',
  '主语跳脱', '越级程度词', '前置定语', '语体', '论述', '修辞手法', '文本结构',
  '信息层级', '句法', '词汇密度', '概念密度', '抽象度',
  // 用户实测报告里漏出来的几个：都是"给同行看的"，不是"给读者看的"
  '量产级', '实用化', '因果链', '标准声明', '论证结构', '叙事节奏', '信息前置', '话语体系',
]

/* note.tag 的白名单（与提示词里一致）。模型自创的词会被映射到最近的一个。 */
export const TAGS = [
  '太大', '没证据', '说法偏了', '说不通', '看不懂', '可以删', '数字虚', '换个说法',
]

const TAG_HINTS = [
  [/最|极|巨大|程度|过度|夸张|失据|撑大/, '太大'],
  [/归因|因果|证据|未名|来源|出处|标准/, '没证据'],
  [/偏|错|不准|误|过强|过早|反转|说反/, '说法偏了'],
  [/跳脱|接不上|不连贯|断裂|逻辑/, '说不通'],
  [/术语|难懂|抽象|名词化|拥挤|密度/, '看不懂'],
  [/冗余|可删|重复|凑数/, '可以删'],
  [/数字|量级|参照|单位/, '数字虚'],
  [/公文|腔|生硬|书面/, '换个说法'],
]

export function fixTag(tag) {
  const t = String(tag || '').trim()
  if (!t) return '换个说法'
  if (TAGS.includes(t)) return t
  for (const [re, canon] of TAG_HINTS) if (re.test(t)) return canon
  return '换个说法'
}

/* 收集需要清扫的字段：verdict / summary / advice / 每条 note 的 text 与 tag。 */
function collect(report) {
  const out = []
  const push = (key, text) => {
    if (typeof text === 'string' && text) out.push({ key, text })
  }
  ;(report.verdict || []).forEach((t, i) => push('v' + i, t))
  ;(report.summary || []).forEach((t, i) => push('s' + i, t))
  ;(report.advice || []).forEach((a, i) => {
    push('a' + i + '.t', a && a.t)
    push('a' + i + '.b', a && a.body)
    push('a' + i + '.h', a && a.how)
  })
  ;(report.rewrite || []).forEach((r, i) => {
    ;(r && r.why ? r.why : []).forEach((t, j) => push('w' + i + '.' + j, t))
  })
  ;(report.annots || []).forEach((a) => {
    ;(a && a.notes ? a.notes : []).forEach((n) => push('n' + n.n, n && n.text))
  })
  return out
}

export function detect(report) {
  const hits = []
  for (const item of collect(report)) {
    const found = BANNED.filter((w) => item.text.includes(w))
    if (found.length) hits.push({ key: item.key, text: item.text, words: found })
  }
  return hits
}

export function buildFixPrompt(hits) {
  const lines = hits.map((h) => JSON.stringify(h.key) + ': ' + h.text).join('\n')
  return `下面这些句子是给一个完全不懂这个专业的人看的，但里面混进了行话：${BANNED.join('、')}。
请逐条改写：意思一点不变，只把行话换成日常说法。
要求：
1. 保持原句的信息量：原来提到哪个词、哪个数字，改完还在。
2. 不要增加解释、不要变长超过一点点。
3. tag 那类两三个字的标签，从这八个里挑一个最贴切的：${TAGS.join('、')}。
4. 只输出一个 JSON 对象：{"key": "改写后的句子"}，key 原样抄回，不要输出别的。

${lines}`
}

/* 把 {key: newText} 合并回原报告；缺失的键保留原样。 */
export function merge(report, fix) {
  if (!fix || typeof fix !== 'object') return report
  const get = (k) => (typeof fix[k] === 'string' && fix[k].trim() ? fix[k] : null)
  const rep = { ...report }
  rep.verdict = (rep.verdict || []).map((t, i) => get('v' + i) || t)
  rep.summary = (rep.summary || []).map((t, i) => get('s' + i) || t)
  rep.advice = (rep.advice || []).map((a, i) => ({
    ...a,
    t: get('a' + i + '.t') || a.t,
    body: get('a' + i + '.b') || a.body,
    how: get('a' + i + '.h') || a.how,
  }))
  rep.rewrite = (rep.rewrite || []).map((r, i) => ({
    ...r,
    why: (r.why || []).map((t, j) => get('w' + i + '.' + j) || t),
  }))
  rep.annots = (rep.annots || []).map((a) => ({
    ...a,
    notes: (a.notes || []).map((n) => ({
      ...n,
      text: get('n' + n.n) || n.text,
      tag: fixTag(n.tag),
    })),
  }))
  return rep
}

/* 只做标签归一，不调模型。没有行话命中时也跑一次，保证 tag 落在白名单里。 */
export function normalizeTags(report) {
  report.annots = (report.annots || []).map((a) => ({
    ...a,
    notes: (a.notes || []).map((n) => ({ ...n, tag: fixTag(n.tag) })),
  }))
  return report
}
