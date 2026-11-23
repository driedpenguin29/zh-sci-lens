/**
 * zh-sci-lens · Web Client（唯一浏览器产物）
 *
 * build.mjs 把 ~/.dsh/skills/zh-sci-lens/templates/engine.js 的 SLX 核心
 * 内联进 __SLX_ENGINE__。因此：
 *   - 测字、打分、判断「这段更像太难懂还是不严谨」全部在本地，零网络；
 *   - 只有「让模型写报告」这一步要经过 host（面板建 job → host followup 给 agent）。
 *
 * 三屏，一条路：
 *   输入（贴文本 + 当场选改法） → 处理中 → 报告（可导出 HTML / Markdown）
 *
 * 硬约束（与 dsh-debate-simulator 对齐）：
 *   - 入口 window.__ModuleLoader__.load({ id, factory })，React 来自 require('react')；
 *   - 注册 sidebar.panellist（图标）+ main（整页），id/key 同名由宿主配对；
 *   - 不用 iframe、不碰 document.head、不往 document.body 追加；
 *   - 样式走 React 树里的 <style>，类名 zsl- 前缀，颜色只在 .zsl 作用域内定义。
 */
window.__ModuleLoader__.load({
  id: 'dsh-zh-sci-lens',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    /* ==================================================================
       引擎（build 时注入，逐条对照 core/zh_sci_lens.py）
       ================================================================== */
    const SLX = (function(){
"use strict";
const ORIG_PARAS = [];

// ---------- 词表（与 Python 逐条一致） ----------
const AI_WORDS = ['赋能','闭环','抓手','底层逻辑','顶层设计','方法论','维度','体系化',
  '深度融合','全面升级','显著提升','有效提升','持续赋能','多维度','值得注意的是',
  '综上所述','总而言之','毋庸置疑','不可否认','在当今','值得关注的是','不难发现','由此可见'];
const NUMBERED = ['首先','其次','再次','其一','其二','其三'];
const NUMBERED_LINE = /^\s*[（(]?[0-9一二三四五六七八九十]{1,2}[)）.．、]\s*\S/;
const READABLE = ['比如','例如','想象','假如','你可以','我们看到','注意','问题是','关键在于',
  '奇怪的是','有意思的是','反过来','先说','再看','回到'];
const FOLLOW = ['也就是说','换句话说','简单说','具体来说','这就意味着','所以','因此','但是','不过','其实'];
const QUALIFIER = ['条件下','假设','近似','范围内','目前','理论上','可能','尚未','不确定','取决于','在模型','量级'];
const FILLER_ADV = ['深入地','切实地','有效地','全面地','系统性地','持续地','进一步地','大力','高度重视','充分','积极'];
const HEDGE = ['某种程度','一定程度上','可以说','应该说','相对而言','总体而言'];
const CONNECTIVES = ['但是','不过','其实','换句话说','也就是说','例如','比如','注意','这是因为',
  '所以','因此','反而','只要','问题是','也就是说','简单说','具体来说'];
const DEF_PATTERNS = [/^所谓/,/指的是/,/定义为/,/是指/,/^.{2,10}是[^，。]{2,20}的一种$/,/称为/,/即为/,/可表述为/];
const QUANT_RE = /(\d+(?:\.\d+)?)\s*(亿年|万年|年|秒|分钟|小时|公里|千米|米|摄氏度|℃|%|倍|个|次|光年|吨|千克)/g;
const SENSATIONAL = ['震惊','颠覆','疯狂','绝望','恐怖','脊背发凉','最恐怖','不敢相信','终于',
  '真相来了','铁律','逆天','摧毁','幽灵'];
const ABSOLUTE = ['一定','必然','绝对','从不','永远','所有','任何','完全','毫无疑问','证明','证实了'];

// ---------- 基础 ----------
// 与 Python re.sub(r'\s', '') 一致：JS 的 \s 包含 U+FEFF，Python 的 \s 不包含。
// 不减掉这一个字，含 'AI 扮演的角色：' 一类段落的 _len 会多算 1，跨过 >2 阈值被误切。
const _len = s => s.replace(/[\s\uFEFF]/g,'').length;
const count = (t,list) => list.reduce((n,w)=> n + (t.split(w).length-1), 0);
const _grad = (x,lo,hi) => hi<=lo ? (x>=hi?1:0) : Math.max(0,Math.min(1,(x-lo)/(hi-lo)));
function _cv(xs){
  if (xs.length < 2) return 0.0;
  const m = xs.reduce((a,b)=>a+b,0)/xs.length;
  if (m === 0) return 0.0;
  const v = xs.reduce((a,b)=>a+(b-m)**2,0)/xs.length;
  return Math.round(Math.sqrt(v)/m*100)/100;
}

// ---------- 句子切分（对应 split_sentences） ----------
const CJKRE = /[\u4e00-\u9fff]/, ENRE = /[A-Za-z0-9]/;
function split_sentences(text){
  // 直接移植 Python split_sentences：三层切分 + 末尾过滤，不借用任何共享状态
  text = String(text||'').trim();
  if (!text) return [];

  // Python：str 即码点序列；这里用 Array.from 保证与 len() 同口径
  const chars = s => Array.from(s);
  const isCJK = ch => ch >= '\u4e00' && ch <= '\u9fff';
  const isEN  = ch => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');
  // Python 的 re.sub(r'\s','') 只剔 ASCII 空白，不含 U+FEFF
  const plen = s => chars(s).filter(ch => !/[ \t\n\r\f\v]/.test(ch)).length;

  const raw = [];
  for (const blk0 of text.split(/\n+/)){
    const blk = blk0.trim();
    if (!blk) continue;
    // L1：中文句末
    const cn = [];
    let cur = '';
    for (const ch of chars(blk)){
      cur += ch;
      if (ch === '。' || ch === '！' || ch === '？' || ch === '；'){ cn.push(cur); cur = ''; }
    }
    if (cur) cn.push(cur);
    // L2：英文句末 + 后随空白
    for (const piece of cn){
      const arr = chars(piece);
      let c = '';
      for (let i = 0; i < arr.length; i++){
        c += arr[i];
        if ((arr[i] === '.' || arr[i] === '!' || arr[i] === '?')
            && i + 1 < arr.length && /\s/.test(arr[i+1])){
          raw.push(c); c = '';
        }
      }
      if (c) raw.push(c);
    }
  }

  // L3：脚本边界（CJK ⇄ Latin），cur 长度按 Python 口径 > 2 才切
  const sents = [];
  for (const piece of raw){
    const arr = chars(piece);
    // 先按 Python 的 strip() 去掉首尾空白，再逐码点扫描
    let lo = 0, hi = arr.length;
    while (lo < hi && /\s/.test(arr[lo])) lo++;
    while (hi > lo && /\s/.test(arr[hi-1])) hi--;
    let cur = '', prev = null;
    for (let i = lo; i < hi; i++){
      const ch = arr[i];
      const kind = isCJK(ch) ? 'cn' : (isEN(ch) ? 'en' : null);
      if (kind === null){ cur += ch; continue; }
      // Python: len(cur) > 2 —— cur 含标点与空白，不剔除空白
      if (prev !== null && kind !== prev && Array.from(cur).length > 2){ sents.push(cur); cur = ''; }
      cur += ch;
      prev = kind;
    }
    if (cur) sents.push(cur);
  }
  // 末尾过滤：去首尾空白后长度 > 1
  return sents.map(s => s.trim()).filter(s => plen(s) > 1);
}

// ---------- 破折号（对应 dashes） ----------
function dashes(text){
  let n = 0;
  for (const line of text.split('\n')){
    const segs = line.split('——');
    if (segs.length >= 3 && segs.every(x => _len(x) <= 14)) continue;
    n += segs.length - 1;
  }
  for (const line of text.split('\n')){
    if (line.includes('——')) continue;
    n += (line.split('—').length - 1);
  }
  return n;
}

// ---------- 定量断言（对应 quant_claims） ----------
function quant_claims(text){
  const out = []; let m;
  const re = new RegExp(QUANT_RE.source, 'g');
  while ((m = re.exec(text)) !== null){
    out.push({value: m[1]+m[2],
      ctx: text.slice(Math.max(0,m.index-18), m.index+m[0].length+18)});
  }
  return out;
}

// ---------- 段落指标（对应 paragraph_metrics） ----------
function paragraph_metrics(p){
  const sents = split_sentences(p);
  const lens = sents.map(_len);
  return {
    chars: _len(p), sents: sents.length, lens: lens,
    cv: lens.length ? _cv(lens) : 0.0,
    max_len: lens.length ? Math.max(...lens) : 0,
    ai: count(p, AI_WORDS),
    dash: dashes(p),
    numbered: count(p, NUMBERED) + (NUMBERED_LINE.test(p) ? 1 : 0),
    filler: count(p, FILLER_ADV),
    conn: count(p, CONNECTIVES),
    defs: DEF_PATTERNS.reduce((n,re)=> n + ((p.match(new RegExp(re.source,'gm'))||[]).length), 0),
    quote: (p.split('“').length-1) + (p.split('《').length-1),
    sensational: count(p, SENSATIONAL),
    absolute: count(p, ABSOLUTE),
    quant: quant_claims(p).length,
    readable: count(p, READABLE),
    follow: count(p, FOLLOW),
    qualifier: count(p, QUALIFIER),
    dialogue: (p.split('你').length-1) + (p.split('我们').length-1),
  };
}

// ---------- 全文分析（对应 analyze） ----------
function analyze(text, mode){
  mode = mode || 'auto';
  const paras = text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const pm = paras.map(paragraph_metrics);
  const lens_all = pm.flatMap(m=>m.lens);
  const total_chars = pm.reduce((a,m)=>a+m.chars,0) || 1;
  const k = x => Math.round(x*1000.0/total_chars*10)/10;
  const agg = {
    paras: paras.length, chars: total_chars,
    sents: pm.reduce((a,m)=>a+m.sents,0),
    mean_len: lens_all.length ? Math.round(lens_all.reduce((a,b)=>a+b,0)/lens_all.length*10)/10 : 0,
    sd_len: _cv(lens_all),
    max_len: lens_all.length ? Math.max(...lens_all) : 0,
    ai_per_k: k(pm.reduce((a,m)=>a+m.ai,0)),
    dash_per_k: k(pm.reduce((a,m)=>a+m.dash,0)),
    conn_per_k: k(pm.reduce((a,m)=>a+m.conn,0)),
    filler_per_k: k(pm.reduce((a,m)=>a+m.filler,0)),
    numbered_per_k: k(pm.reduce((a,m)=>a+m.numbered,0)),
    defs: pm.reduce((a,m)=>a+m.defs,0),
    sensational_per_k: k(pm.reduce((a,m)=>a+m.sensational,0)),
    absolute_per_k: k(pm.reduce((a,m)=>a+m.absolute,0)),
    term_per_k: null,
    quant_claims: paras.flatMap(quant_claims),
    readable_per_k: k(pm.reduce((a,m)=>a+m.readable,0)),
    follow_per_k: k(pm.reduce((a,m)=>a+m.follow,0)),
    qualifier_per_k: k(pm.reduce((a,m)=>a+m.qualifier,0)),
    dialogue_per_k: k(pm.reduce((a,m)=>a+m.dialogue,0)),
  };
  // ---- 趣味性：四种可数结构
  let hooks = 0;
  for (const p of paras){
    const ss = split_sentences(p);
    if (ss.length >= 2 && _len(ss[ss.length-1]) <= 18) hooks += 1;
  }
  const qmark = paras.reduce((a,p)=> a + (p.split('？').length-1) + (p.split('?').length-1), 0);
  let anchors = 0;
  for (const p of paras){
    anchors += (p.match(/\d{2,4}年|\d+(?:\.\d+)?\s*[百千万亿]*\s*(?:年|秒|米|倍|%|天|万光年)/g)||[]).length;
    anchors += (p.match(/[A-Z]{2,}[\s\d]{0,8}\d*/g)||[]).length;
    anchors += (p.split('“').length-1);
  }
  const dialogue = paras.reduce((a,p)=> a + (p.split('你').length-1), 0);
  const hook_per_para = hooks / Math.max(paras.length,1);
  const qmark_per_k = qmark*1000.0/total_chars;
  const anchor_per_k = anchors*1000.0/total_chars;
  let fun = 25.0 * _grad(hook_per_para, 0.05, 0.35);
  fun += 20.0 * _grad(qmark_per_k, 0.5, 4.0);
  fun += 30.0 * _grad(anchor_per_k, 2.0, 15.0);
  fun += 25.0 * _grad(dialogue*1000.0/total_chars, 2.0, 20.0);
  fun -= Math.min(agg.sensational_per_k, 15)/15 * 25;
  agg.hook_per_para = Math.round(hook_per_para*100)/100;
  agg.qmark_per_k = Math.round(qmark_per_k*100)/100;
  agg.anchor_per_k = Math.round(anchor_per_k*10)/10;
  agg.dialogue_per_k = Math.round(dialogue*1000.0/total_chars*10)/10;

  let read = Math.min(agg.follow_per_k + agg.conn_per_k, 12)/12*35;
  read += Math.max(0, 55-agg.mean_len)/55*35;
  read += Math.min(Math.max(0, agg.sd_len-0.12)/0.40, 1.0)*20;
  read += Math.min(hook_per_para, 0.5)/0.5*10;
  agg.fun_score = Math.round(Math.max(0, Math.min(100, fun)));
  agg.read_score = Math.round(Math.max(0, Math.min(100, read)));
  agg.assert_strength = Math.round(Math.max(0, agg.absolute_per_k*3 + agg.sensational_per_k*2
    - agg.qualifier_per_k*0.4)*10)/10;

  // ---- 模式判定
  let hard = 0, shallow = 0;
  hard += Math.max(0, (agg.mean_len-45))/45*40;
  hard += Math.max(0, (0.20-agg.sd_len))/0.20*25;
  hard += Math.max(0, (agg.defs-2))/10*15;
  hard += (agg.conn_per_k < 5 ? 1 : 0)*10;
  shallow += Math.max(0, (agg.sensational_per_k-3))/15*40;
  shallow += Math.max(0, (agg.absolute_per_k-2))/10*20;
  shallow += Math.max(0, agg.dash_per_k-1.5)/5*15;
  shallow += Math.max(0, (agg.mean_len-40))*0.3;
  shallow += Math.min(agg.quant_claims.length,10)*1.5;
  if (mode === 'auto') mode = (hard >= shallow) ? 'pop' : 'rig';

  const signals = [];
  if (agg.mean_len > 45) signals.push(`平均句长 ${agg.mean_len} 字 > 45：长句连缀，读者要一口气承担多个动作`);
  if (agg.sd_len < 0.20) signals.push(`句长变异 ${agg.sd_len} < 0.20：全篇句长几乎一样，没有短句给读者换气`);
  if (agg.conn_per_k < 5) signals.push(`连接词密度 ${agg.conn_per_k}/千字 < 5：推论关系没有说出来，靠读者自己补`);
  if (agg.defs > 2 && mode === 'pop') signals.push(`定义式句型 ${agg.defs} 处：教材腔，先给定义再给动机`);
  if (agg.sensational_per_k > 3) signals.push(`情绪词密度 ${agg.sensational_per_k}/千字：论证被情绪替代`);
  if (agg.absolute_per_k > 2) signals.push(`绝对化断言 ${agg.absolute_per_k}/千字：缺少限定条件`);
  if (agg.quant_claims.length) signals.push(`可核验定量断言 ${agg.quant_claims.length} 处：模式 B 必须逐条核对文献`);
  return {mode, score_hard: Math.round(hard), score_shallow: Math.round(shallow), agg, signals, per_para: pm};
}

// ---------- 控件（对应 c_*） ----------
function c_dash(text){
  return text.split('\n').map(line=>{
    const segs = line.split('——');
    if (segs.length >= 3 && segs.every(x=>_len(x) <= 14)) return line;
    if (!line.includes('——') && !line.includes('—')) return line;
    // 成对破折号夹的是一句解释语：改成「：…，」最贴合中文习惯。
    let l = line.replace(/——([^。！？\n]{0,40}?)——/g, '：$1，');
    // 剩下单个破折号要看右边是什么：短名词（≤20 字）是同位语，用逗号接；
    // 长从句才断成句号。一律断句会把「铁律——热力学第二定律」切成两个碎句。
    const parts = l.split('——');
    if (parts.length > 1){
      let out = parts[0];
      for (let i = 1; i < parts.length; i += 1){
        const head = (parts[i].split(/[，。！？；]/)[0] || '');
        out += (_len(head) <= 20 ? '，' : '。') + parts[i];
      }
      l = out;
    }
    // 单个 em dash：dashes() 同样计入，不清掉就永远过不了闸门。
    if (l.includes('—')) l = l.split('—').join('，');
    return l.replace(/，\s*，/g, '，');
  }).join('\n');
}
function c_ai(text){
  const rep = {'赋能':'提供支持','闭环':'完整流程','抓手':'着手的地方','底层逻辑':'基本道理',
    '顶层设计':'整体安排','方法论':'方法','体系化':'成体系','深度融合':'结合得更紧',
    '显著提升':'明显提高','值得注意的是':'需要注意的是','综上所述':'总的来说',
    '毋庸置疑':'可以确定','由此可见':'于是可以看出'};
  for (const [a,b] of Object.entries(rep)) text = text.split(a).join(b);
  return text;
}
function c_numbered(text){
  for (const w of ['首先，','其次，','再次，','最后，']) text = text.split(w).join('');
  return text;
}
function c_filler(text){
  for (const w of FILLER_ADV) text = text.split(w).join('');
  return text.replace(/，\s*，/g, '，');
}
function c_hedge(text){
  for (const w of HEDGE) text = text.split(w).join('');
  return text;
}
function c_universal(text){
  // 逐条带上下文，不能一律替换：
  // 「必然的结论」是形容词位，换成「在这些前提下会」会写出病句；
  // 「绝对值 / 绝对零度」是术语，「一定量 / 一定程度」是数量词，都不能动。
  let t = text.replace(/必然的/g, '在这些前提下成立的');
  t = t.replace(/必然(?!的)/g, '在这些前提下');
  t = t.replace(/绝对(?!值|零)/g, '在实验范围内');
  t = t.replace(/一定(?=会|能|要|是|将|得)/g, '在有这些条件时');
  t = t.replace(/从不/g, '目前没有观察到');
  t = t.replace(/永远/g, '至今');
  t = t.replace(/完全/g, '基本');
  // 数学里的「证明」常是名词（证明过程），只动动词形。
  t = t.replace(/证明了/g, '支持了');
  t = t.replace(/证实了/g, '与该说法一致');
  return t;
}

// [显示名, 可执行函数(null=需模型), 预估增益, 一句描述]
const CONTROLS = {
  unv:['绝对化改有条件', c_universal, 18, '「必然 / 所有」改成带条件的陈述'],
  mon:['降低术语密度', null, 15, '术语先解释再用，或换掉不必要的行话'],
  sub:['恢复主语', null, 12, '把无主句补回是谁在做这件事'],
  cf:['拆分长句', c_dash, 14, '一句话只留一个转折，破折号改逗号或断句'],
  ai:['清除AI词', c_ai, 10, '赋能 / 闭环 / 综上所述 一类模板词'],
  num:['打散编号腔', c_numbered, 8, '行首的 1. 2. 3. 改成自然过渡'],
  fil:['删冗余状语', c_filler, 6, '深入地 / 切实地 / 有效地 这类空状语'],
  hed:['去对冲话术', c_hedge, 6, '某种程度上 / 可以说 这类不承担信息的话'],
  met:['加可核验细节', null, 20, '给年份、数字、专名，让抽象句落地'],
  ana:['加类比', null, 22, '用日常经验搭桥，必须附「它在哪不成立」'],
  dlg:['加对话感', null, 25, '第二人称、直接提问，趣味分权重最大的一项'],
  qst:['定义句改提问', null, 18, '「X 是 Y」改成「那 X 到底是什么？」'],
  hok:['加悬念钩子', null, 16, '段末压一句短句，制造读下去的拉力'],
  anc:['加具体锚点', null, 14, '具体的人、时间、地点、数字，替掉泛指'],
};
const ENGINE_OK = Object.keys(CONTROLS).filter(k => CONTROLS[k][1]);

function apply_controls(text, names){
  const log = [];
  for (const n of names){
    const fn = (CONTROLS[n]||[null,null])[1];
    if (!fn){ log.push(`${n}: 需 LLM 执行`); continue; }
    const before = text;
    text = fn(text);
    if (text !== before) log.push(`${n}: 已改`);
  }
  return {text, log};
}

const GATE = {tell_max:15, dash_max:0, parallel_max:1, para_cv_min:0.20,
              mean_len_max:45, ai_per_k_max:2.0, conn_per_k_min:5.0};
function check_gates(text){
  const a = analyze(text), g = [];
  if (a.agg.dash_per_k * a.agg.chars / 1000 > GATE.dash_max)
    g.push(['dash', `破折号 ${a.agg.dash_per_k}/千字 未清零`]);
  if (a.agg.mean_len > GATE.mean_len_max)
    g.push(['len', `平均句长 ${a.agg.mean_len} > ${GATE.mean_len_max}`]);
  if (a.agg.sd_len < GATE.para_cv_min)
    g.push(['cv', `句长变异 ${a.agg.sd_len} < ${GATE.para_cv_min}`]);
  if (a.agg.ai_per_k > GATE.ai_per_k_max)
    g.push(['ai', `AI 词 ${a.agg.ai_per_k}/千字 > ${GATE.ai_per_k_max}`]);
  return {pass: g.length===0, fail: g, agg: a.agg};
}

return {ORIG_PARAS: ORIG_PARAS, AI_WORDS, CONTROLS, ENGINE_OK, GATE, split_sentences, paragraph_metrics,
        analyze, apply_controls, check_gates, dashes, quant_claims, _len, _cv};
})();

    const API = '/api/zh-sci-lens';

    const MODES = {
      rig: {
        key: 'rig',
        name: '严谨化',
        en: 'RIGOR',
        lead: '把断言压回它证据能支撑的位置',
        body: '该加条件的加条件，该降级的降级，该删的删。不改知识，只改确定性。',
        fit: '适合：科普、营销稿、观点文里那些说得比证据更硬的话。',
      },
      pop: {
        key: 'pop',
        name: '通俗化',
        en: 'PLAIN',
        lead: '删掉重复，把机制提到前面',
        body: '把解释句从句尾挖出来放开头，砍掉情绪升级。不加解释，只做减法和重排。',
        fit: '适合：术语密、长句多、读完记不住讲什么的专业段落。',
      },
    };

    /* ── 文本工具 ─────────────────────────────────────── */

    const esc = (s) =>
      String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** 原文按非空行切段；页面上段号从 1 起。 */
    const splitParas = (text) =>
      String(text || '')
        .replace(/\r\n?/g, '\n')
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

    /** 段落里把每个 quote 依次找出来，切成「普通 / 标注」片段。 */
    function segmentsOf(para, notes) {
      const hits = [];
      let cursor = 0;
      const list = (notes || []).filter((n) => n && n.quote && String(n.quote).trim());
      for (const n of list) {
        const q = String(n.quote);
        const at = para.indexOf(q, cursor);
        if (at < 0) continue;
        hits.push({ start: at, end: at + q.length, n: n.n });
        cursor = at + q.length;
      }
      if (!hits.length) return [{ text: para, n: null }];
      const out = [];
      let last = 0;
      for (const hit of hits) {
        if (hit.start > last) out.push({ text: para.slice(last, hit.start), n: null });
        out.push({ text: para.slice(hit.start, hit.end), n: hit.n });
        last = hit.end;
      }
      if (last < para.length) out.push({ text: para.slice(last), n: null });
      return out;
    }

    const fmt = (x, d) => (typeof x === 'number' && isFinite(x) ? x.toFixed(d) : '—');

    /** 用本地引擎量一次，给输入页与 byline 用。 */
    function measure(text) {
      try {
        const r = SLX.analyze(text);
        const a = r.agg || {};
        return {
          mode: r.mode,
          hard: Math.round(r.score_hard || 0),
          shallow: Math.round(r.score_shallow || 0),
          chars: a.chars || 0,
          paras: a.paras || 0,
          sents: a.sents || 0,
          mean_len: Number(fmt(a.mean_len, 1)),
          sd_len: Number(fmt(a.sd_len, 2)),
          assert_strength: Number(fmt(a.assert_strength, 1)),
          read_score: Math.round(a.read_score || 0),
          fun_score: Math.round(a.fun_score || 0),
          conn_per_k: Number(fmt(a.conn_per_k, 1)),
          dialogue_per_k: Number(fmt(a.dialogue_per_k, 1)),
          qmark_per_k: Number(fmt(a.qmark_per_k, 1)),
          hook_per_para: Number(fmt(a.hook_per_para, 2)),
          sensational_per_k: Number(fmt(a.sensational_per_k, 1)),
          dash_per_k: Number(fmt(a.dash_per_k, 1)),
        };
      } catch {
        return null;
      }
    }

    /* ── 样式 ─────────────────────────────────────────── */

    const CSS = `
.zsl{
  --paper:#FAF7F1; --paper2:#F2ECE1; --ink:#191512; --ink2:#2E2823;
  --muted:#6E6459; --faint:#9C907F; --line:#E4DBCD; --line2:#CFC3AF;
  --seal:#A63D2F; --sealSoft:#F3E5E0; --ok:#2F6B4F; --warn:#8A5A12; --bad:#9C2B22;
  --serif:"Songti SC","Source Han Serif SC","Noto Serif CJK SC","STSong",Georgia,serif;
  --sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  position:relative;height:100%;overflow:auto;background:var(--paper);color:var(--ink);
  font-family:var(--serif);-webkit-font-smoothing:antialiased;
}
.zsl *{box-sizing:border-box}
.zsl-wrap{max-width:1020px;margin:0 auto;padding:0 46px 96px}
.zsl ::selection{background:var(--sealSoft)}

/* 报头 */
.zsl-mast{display:flex;align-items:flex-start;gap:18px;padding:44px 0 20px}
.zsl-seal{
  flex:0 0 auto;width:46px;height:46px;border-radius:3px;background:var(--seal);color:#FFF6F2;
  font-family:var(--serif);font-size:19px;line-height:1;display:grid;place-items:center;
  letter-spacing:1px;box-shadow:0 1px 0 rgba(0,0,0,.08);
}
.zsl-seal span{display:block;text-align:center}
.zsl-mast h1{
  margin:0;font-size:26px;font-weight:700;letter-spacing:.01em;line-height:1.2;
}
.zsl-mast .zsl-eyebrow{
  font-family:var(--sans);font-size:10.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--faint);margin-top:7px;
}

/* 输入页 */
.zsl-in{padding-top:26px}
.zsl-in-row{display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:38px;align-items:start}
.zsl-lab{
  display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  font-family:var(--sans);font-size:12px;letter-spacing:.06em;color:var(--muted);
  padding-bottom:9px;border-bottom:1px solid var(--line2);
}
.zsl-lab b{font-weight:600;color:var(--ink2)}
.zsl-ta{
  width:100%;min-height:340px;resize:vertical;display:block;
  margin:14px 0 0;padding:20px 22px;
  background:#FFFDF8;border:1px solid var(--line);border-radius:2px;
  font-family:var(--serif);font-size:16.5px;line-height:1.95;color:var(--ink);
  outline:none;transition:border-color .15s;
}
.zsl-ta:focus{border-color:var(--seal)}
.zsl-ta::placeholder{color:var(--faint)}
.zsl-under{
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  margin-top:10px;font-family:var(--sans);font-size:11.5px;color:var(--faint);
}
.zsl-under b{color:var(--ink2);font-weight:600}
.zsl-pill{
  font-family:var(--sans);font-size:10.5px;letter-spacing:.08em;padding:2px 7px;border-radius:2px;
  background:var(--paper2);color:var(--muted);
}
.zsl-pill.rig{background:var(--sealSoft);color:var(--seal)}
.zsl-pill.pop{background:#E8EFE8;color:var(--ok)}

.zsl-modes h3{
  margin:6px 0 0;font-family:var(--sans);font-size:10.5px;font-weight:700;
  letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
}
.zsl-mode{
  display:block;width:100%;text-align:left;margin-top:11px;padding:15px 16px 14px;
  background:transparent;border:1px solid var(--line2);border-radius:2px;cursor:pointer;
  font-family:inherit;transition:border-color .15s,background .15s,transform .12s;
}
.zsl-mode:hover:not(:disabled){background:#FFFDF8;border-color:var(--seal);transform:translateY(-1px)}
.zsl-mode:disabled{opacity:.45;cursor:not-allowed}
.zsl-mode:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.zsl-mode .zsl-mn{display:flex;align-items:baseline;gap:9px;font-size:19px;font-weight:700}
.zsl-mode .zsl-mn i{
  font-family:var(--sans);font-style:normal;font-size:9.5px;font-weight:700;
  letter-spacing:.14em;color:var(--faint);
}
.zsl-mode .zsl-ml{margin-top:6px;font-size:13px;line-height:1.7;color:var(--ink2)}
.zsl-mode .zsl-mb{margin-top:5px;font-family:var(--sans);font-size:11.5px;line-height:1.7;color:var(--muted)}
.zsl-hint{
  margin:16px 0 0;font-family:var(--sans);font-size:11.5px;line-height:1.75;color:var(--faint);
  padding-top:14px;border-top:1px solid var(--line);
}

/* 处理中 */
.zsl-wait{padding:110px 0 0;max-width:520px}
.zsl-wait-t{font-size:38px;font-weight:700;letter-spacing:.06em}
.zsl-wait-e{
  margin-top:6px;font-family:var(--sans);font-size:11px;letter-spacing:.3em;
  text-transform:uppercase;color:var(--faint);
}
.zsl-steps{margin:40px 0 0;padding:0;list-style:none;border-top:1px solid var(--line2)}
.zsl-steps li{
  display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);
  font-family:var(--sans);font-size:12.5px;color:var(--faint);
}
.zsl-steps li .zsl-dot{width:5px;height:5px;border-radius:50%;background:var(--line2);flex:0 0 auto}
.zsl-steps li.on{color:var(--ink2)}
.zsl-steps li.on .zsl-dot{background:var(--seal);box-shadow:0 0 0 3px var(--sealSoft)}
.zsl-steps li.done{color:var(--muted)}
.zsl-steps li.done .zsl-dot{background:var(--ok)}
.zsl-steps li b{font-weight:600;color:inherit}
.zsl-steps li span{margin-left:auto;font-size:11px;color:var(--faint)}
.zsl-actions{display:flex;gap:10px;align-items:center}
.zsl-err{
  margin:26px 0 0;padding:14px 16px;border-left:2px solid var(--bad);background:#FBF0EE;
  font-family:var(--sans);font-size:12.5px;line-height:1.75;color:#7E231B;
}

/* 报告 */
.zsl-rep-head{padding:30px 0 0}
.zsl-rep-head h1{
  margin:0;font-size:clamp(26px,3.4vw,36px);font-weight:700;line-height:1.34;letter-spacing:-.012em;
}
.zsl-rep-head h1 em{font-style:normal;color:var(--seal)}
.zsl-byline{
  margin-top:12px;font-family:var(--sans);font-size:12px;color:var(--muted);
  display:flex;flex-wrap:wrap;align-items:center;gap:9px;
}
.zsl-byline i{font-style:normal;color:var(--line2)}
.zsl-bar{
  display:flex;align-items:center;gap:10px;margin-top:22px;padding:11px 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);
  font-family:var(--sans);font-size:11.5px;color:var(--muted);
}
.zsl-bar .zsl-grow{flex:1}
.zsl-btn{
  appearance:none;border:1px solid var(--line2);background:transparent;border-radius:2px;
  font-family:var(--sans);font-size:11.5px;color:var(--muted);cursor:pointer;
  padding:6px 11px;transition:border-color .15s,color .15s,background .15s;
}
.zsl-btn:hover{border-color:var(--seal);color:var(--seal);background:#FFFDF8}
.zsl-btn:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.zsl-btn.primary{background:var(--seal);border-color:var(--seal);color:#FFF7F3}
.zsl-btn.primary:hover{background:#93352A;color:#FFF7F3}

.zsl-verdict{margin:34px 0 0;padding-left:22px;border-left:2px solid var(--seal)}
.zsl-verdict p{margin:0;font-size:19px;line-height:1.86;color:var(--ink)}
.zsl-verdict p + p{margin-top:12px;font-size:15px;line-height:1.95;color:var(--ink2)}
.zsl-verdict p{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:start}
.zsl-verdict .lb{font-size:11px;font-weight:700;letter-spacing:.2em;color:var(--seal);padding-top:.55em;white-space:nowrap}
.zsl-verdict .tx{grid-column:2}

.zsl-sec{margin:56px 0 0;border-top:1px solid var(--line);padding-top:26px}
.zsl-sec-head{display:flex;align-items:baseline;gap:16px;margin-bottom:22px}
.zsl-sec-no{
  font-family:var(--sans);font-size:10.5px;font-weight:700;letter-spacing:.14em;color:var(--seal);
}
.zsl-sec-head h2{margin:0;font-size:20px;font-weight:700;letter-spacing:.01em}
.zsl-sec-head .zsl-sub{
  margin-left:auto;font-family:var(--sans);font-size:11.5px;color:var(--faint);
}

.zsl-rows{border-top:1px solid var(--line)}
.zsl-row{
  display:grid;grid-template-columns:minmax(0,1fr) 286px;gap:44px;
  padding:24px 0;border-bottom:1px solid var(--line);
}
.zsl-row .zsl-body p{margin:0;font-size:17px;line-height:2.02;color:var(--ink2)}
.zsl-row .zsl-body p + p{margin-top:12px}

/* 宿主主题通常给 mark 定义了高亮底色（<mark> 的 UA 默认是黄色/蓝色），
   这里必须加作用域并 !important，否则批注会被染成荧光色。 */
.zsl.zsl .zsl-mark{
  font-weight:700 !important;font-style:italic !important;color:#6B635C !important;
  background:#F0EBE2 !important;border-bottom:1px dotted rgba(166,61,47,.55) !important;
  padding:1px 2px !important;border-radius:2px !important;
  -webkit-text-fill-color:#6B635C !important;
}
.zsl-sup{
  font-family:var(--sans);font-size:9.5px;font-weight:700;font-style:normal;color:var(--seal);
  vertical-align:super;margin-left:1px;letter-spacing:0;
}

.zsl-notes{display:flex;flex-direction:column;gap:13px}
.zsl-note{border-left:1px solid var(--line2);padding:0 0 0 12px}
.zsl-note.lit{border-left-color:var(--seal)}
.zsl-note .zsl-nn{
  display:flex;align-items:center;gap:7px;
  font-family:var(--sans);font-size:11px;font-weight:700;color:var(--seal);
}
.zsl-note .zsl-tag{
  font-weight:600;color:var(--ink2);letter-spacing:.02em;
}
.zsl-note p{
  margin:5px 0 0;font-family:var(--sans);font-size:12.5px;line-height:1.78;color:var(--muted);
}
.zsl-clean{
  font-family:var(--sans);font-size:11.5px;color:var(--faint);padding-left:12px;
  border-left:1px solid var(--line);
}

.zsl-rw .zsl-row .zsl-body p{font-size:17.5px;line-height:2.05;color:var(--ink)}
.zsl-why{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.zsl-why li{
  position:relative;padding-left:12px;font-family:var(--sans);font-size:12.5px;
  line-height:1.78;color:var(--muted);
}
.zsl-why li::before{content:"";position:absolute;left:0;top:.72em;width:5px;height:1px;background:var(--line2)}

.zsl-sum{margin:0;padding:0;list-style:none;counter-reset:s}
.zsl-sum li{
  counter-increment:s;position:relative;padding:13px 0 13px 46px;border-bottom:1px solid var(--line);
  font-size:16.5px;line-height:1.9;color:var(--ink2);
}
.zsl-sum li::before{
  content:counter(s,decimal-leading-zero);position:absolute;left:0;top:15px;
  font-family:var(--sans);font-size:10.5px;font-weight:700;color:var(--seal);letter-spacing:.1em;
}
.zsl-sum li:last-child{border-bottom:0}

.zsl-facts{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:12.5px}
.zsl-facts th{
  text-align:left;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:var(--faint);padding:0 14px 9px 0;border-bottom:1px solid var(--line2);
}
.zsl-facts td{padding:13px 14px 13px 0;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.75;color:var(--muted)}
.zsl-facts td:first-child{font-family:var(--serif);font-size:15px;color:var(--ink2);width:34%}
.zsl-facts td.v{width:104px;font-weight:700;white-space:nowrap}
.zsl-facts td.v.bad{color:var(--bad)}
.zsl-facts td.v.mid{color:var(--warn)}
.zsl-facts td.v.ok{color:var(--ok)}

.zsl-adv{margin:0;padding:0;list-style:none;counter-reset:a}
.zsl-adv li{
  counter-increment:a;display:grid;grid-template-columns:46px minmax(0,1fr);gap:20px;
  padding:22px 0;border-bottom:1px solid var(--line);
}
.zsl-adv li:last-child{border-bottom:0}
.zsl-adv li::before{
  content:counter(a,decimal-leading-zero);font-family:var(--sans);font-size:10.5px;font-weight:700;
  color:var(--seal);letter-spacing:.1em;padding-top:6px;
}
.zsl-adv .zsl-at{font-size:17px;font-weight:700;line-height:1.6;margin:0}
.zsl-adv .zsl-ab{margin:7px 0 0;font-size:15.5px;line-height:1.95;color:var(--ink2)}
.zsl-adv .zsl-how{
  margin:11px 0 0;padding:10px 13px;background:var(--paper2);
  font-family:var(--sans);font-size:12px;line-height:1.75;color:var(--muted);
}
.zsl-adv .zsl-how b{color:var(--seal);font-weight:700;letter-spacing:.04em;margin-right:6px}

.zsl-foot{
  margin-top:56px;padding-top:18px;border-top:1px solid var(--line2);
  display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;
  font-family:var(--sans);font-size:11px;color:var(--faint);
}

/* 宿主主题（win95 / fluent 等）会给 button / textarea 直接上样式，
   而且常带 .theme-x 前缀（0,1,1），单类名压不住。这里统一加一层作用域与 !important。 */
.zsl.zsl .zsl-ta{
  background:#FFFDF8 !important;border:1px solid var(--line) !important;border-radius:2px !important;
  padding:20px 22px !important;font-family:var(--serif) !important;
  font-size:16.5px !important;line-height:1.95 !important;color:var(--ink) !important;
  box-shadow:none !important;outline:none !important;
}
.zsl.zsl .zsl-ta:focus{border-color:var(--seal) !important}
.zsl.zsl .zsl-mode{
  background:transparent !important;border:1px solid var(--line2) !important;border-radius:2px !important;
  padding:15px 16px 14px !important;font-family:inherit !important;color:var(--ink) !important;
  box-shadow:none !important;
}
.zsl.zsl .zsl-mode:hover:not(:disabled){background:#FFFDF8 !important;border-color:var(--seal) !important}
.zsl.zsl .zsl-mode:disabled{opacity:.62 !important}
.zsl.zsl .zsl-btn{
  background:transparent !important;border:1px solid var(--line2) !important;border-radius:2px !important;
  padding:6px 11px !important;font-family:var(--sans) !important;font-size:11.5px !important;
  color:var(--muted) !important;box-shadow:none !important;
}
.zsl.zsl .zsl-btn:hover{border-color:var(--seal) !important;color:var(--seal) !important;background:#FFFDF8 !important}
.zsl.zsl .zsl-btn.primary{background:var(--seal) !important;border-color:var(--seal) !important;color:#FFF7F3 !important}
.zsl.zsl .zsl-btn.primary:hover{background:#93352A !important;color:#FFF7F3 !important}

@media (max-width:860px){
  .zsl-wrap{padding:0 22px 72px}
  .zsl-in-row,.zsl-row{grid-template-columns:1fr;gap:16px}
  .zsl-notes{flex-direction:row;flex-wrap:wrap}
  .zsl-note{flex:1 1 220px}
  .zsl-mast{padding:28px 0 16px}
  .zsl-sec-head{flex-wrap:wrap;gap:8px 14px}
  .zsl-sec-head .zsl-sub{margin-left:0}
  .zsl-facts td:first-child{width:auto}
}
@media (max-width:560px){
  .zsl-row .zsl-body p,.zsl-rw .zsl-row .zsl-body p{font-size:16.5px;line-height:1.95}
  .zsl-adv li{grid-template-columns:32px minmax(0,1fr);gap:12px}
  .zsl-wait{padding-top:64px}
  .zsl-wait-t{font-size:28px}
  .zsl-facts, .zsl-facts tbody, .zsl-facts tr, .zsl-facts td{display:block;width:auto}
  .zsl-facts thead{display:none}
  .zsl-facts tr{padding:14px 0;border-bottom:1px solid var(--line)}
  .zsl-facts td{border:0;padding:0;white-space:normal}
  .zsl-facts td.v{margin:6px 0}
}
@media (prefers-reduced-motion:reduce){.zsl *{transition:none !important}}
`;

    /* ── 小部件 ───────────────────────────────────────── */

    const Seal = () => h('div', { className: 'zsl-seal' }, h('span', null, '双'), h('span', null, '镜'));

    const Mast = ({ children }) =>
      h(
        'header',
        { className: 'zsl-mast' },
        h(Seal),
        h('div', null, h('h1', null, '双镜批注本'), h('div', { className: 'zsl-eyebrow' }, 'Dual-Lens Chinese Tool · 中文表达双镜片'), children),
      );

    /* ── 屏幕 1：输入 ─────────────────────────────────── */

    function ScreenInput({ onPick, busy, error }) {
      const [text, setText] = useState('');
      const stats = useMemo(() => (text.trim().length > 8 ? measure(text) : null), [text]);
      const paras = useMemo(() => splitParas(text).length, [text]);

      // rig = 问题更偏向「不严谨」；pop = 问题更偏向「难懂」。这是引擎的判定，不是褒贬。
      const lean = stats ? (stats.mode === 'rig' ? '偏向不严谨' : '偏向难懂') : null;

      return h(
        'div',
        { className: 'zsl', key: 'screen' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'zsl-wrap' },
          h(Mast),
          h(
            'section',
            { className: 'zsl-in' },
            h(
              'div',
              { className: 'zsl-in-row' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'zsl-lab' },
                  h('b', null, '请键入文本'),
                  h('span', null, '粘贴或直接打字，边打边测'),
                ),
                h('textarea', {
                  className: 'zsl-ta',
                  value: text,
                  spellCheck: false,
                  placeholder:
                    '把要处理的一段中文放进来。\n\n一段一段地写（空行分段），报告会按段给批注。\n几段到十几段最合适；太长也能跑，只是等得久一点。',
                  onChange: (e) => setText(e.target.value),
                }),
                h(
                  'div',
                  { className: 'zsl-under' },
                  h('b', null, `${Array.from(text.replace(/\s/g, '')).length.toLocaleString()} 字`),
                  h('span', null, `· ${paras} 段`),
                  stats
                    ? h(
                        'span',
                        { className: 'zsl-pill ' + stats.mode },
                        `${lean} · 难懂 ${stats.hard} / 不严谨 ${stats.shallow}`,
                      )
                    : h('span', { className: 'zsl-pill' }, '引擎待测'),
                  stats ? h('span', null, `句长 ${stats.mean_len} · 可读 ${stats.read_score} · 趣味 ${stats.fun_score}`) : null,
                ),
                error ? h('div', { className: 'zsl-err' }, error) : null,
              ),
              h(
                'aside',
                { className: 'zsl-modes' },
                h('h3', null, '两种改法，选一种'),
                ...['rig', 'pop'].map((k) => {
                  const m = MODES[k];
                  return h(
                    'button',
                    {
                      key: k,
                      className: 'zsl-mode',
                      type: 'button',
                      disabled: busy || text.trim().length < 12,
                      onClick: () => onPick(k, text, stats),
                    },
                    h('span', { className: 'zsl-mn' }, m.name, h('i', null, m.en)),
                    h('span', { className: 'zsl-ml' }, m.lead),
                    h('span', { className: 'zsl-mb' }, m.body),
                  );
                }),
                h(
                  'p',
                  { className: 'zsl-hint' },
                  '只跑你按下的那一种。两种都做一遍是两份工作、两倍时间，而你要的通常只有一份。',
                ),
              ),
            ),
          ),
        ),
      );
    }

    /* ── 屏幕 2：处理中 ───────────────────────────────── */

    function ScreenWait({ mode, elapsed, step, error, onBack, onRetry }) {
      const steps = [
        ['收到文本', '本地测量完成'],
        ['交给模型', '正在写'],
        ['整理报告', '批注 · 改写 · 建议'],
        ['写入磁盘', '可导出'],
      ];
      return h(
        'div',
        { className: 'zsl', key: 'screen' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'zsl-wrap' },
          h(Mast),
          h(
            'section',
            { className: 'zsl-wait' },
            h('div', { className: 'zsl-wait-t' }, '处理中'),
            h('div', { className: 'zsl-wait-e' }, 'Processing'),
            h(
              'ol',
              { className: 'zsl-steps' },
              steps.map(([t, d], i) =>
                h(
                  'li',
                  { key: t, className: i < step ? 'done' : i === step ? 'on' : '' },
                  h('span', { className: 'zsl-dot' }),
                  h('b', null, t),
                  h('span', null, d),
                ),
              ),
            ),
            h(
              'div',
              { className: 'zsl-under', style: { marginTop: 18 } },
              h('span', null, `${MODES[mode] ? MODES[mode].name : ''} · 已用 ${elapsed}s`),
              h('span', null, '报告由模型写，通常 30–90 秒'),
            ),
            error ? h('div', { className: 'zsl-err' }, error) : null,
            error
              ? h(
                  'div',
                  { className: 'zsl-actions', style: { marginTop: 18 } },
                  // 一次跑 90 秒，失败后让用户从输入页重来一遍太贵；原地重试。
                  onRetry
                    ? h(
                        'button',
                        { className: 'zsl-btn primary', type: 'button', onClick: onRetry },
                        '重试一次',
                      )
                    : null,
                  h('button', { className: 'zsl-btn', type: 'button', onClick: onBack }, '回到输入'),
                )
              : null,
          ),
        ),
      );
    }

    /* ── 报告渲染 ─────────────────────────────────────── */

    function renderMarked(para, notes, onHover) {
      const segs = segmentsOf(para, notes);
      return segs.map((s, i) => {
        if (s.n == null) return h('span', { key: i }, s.text);
        return h(
          'span',
          { key: i },
          h(
            'mark',
            {
              className: 'zsl-mark',
              onMouseEnter: () => onHover(s.n, true),
              onMouseLeave: () => onHover(s.n, false),
            },
            s.text,
          ),
          h('sup', { className: 'zsl-sup' }, String(s.n)),
        );
      });
    }

    const VLAB = ['病症', '处理'];

    /* 模型有时自己写「病症：」「处理：」开头；标签由页面统一给，这里剥掉，避免"病症：病症：…"。 */
    const VLABELS = '病症诊断|病症|诊断|问题|处理办法|处理|改法|怎么改';
    const RE_BRACKET = new RegExp('^\\s*【\\s*(?:' + VLABELS + ')\\s*】\\s*');
    const RE_COLON = new RegExp('^\\s*(?:' + VLABELS + ')\\s*[：:]\\s*');
    /* 模型爱自己加"【病症】""处理："这类前缀；标签由页面统一给，这里剥掉，
       否则会渲染成「病症  【病症】开头一句…」叠两层。 */
    function stripVerdictLabel(t) {
      return String(t).replace(RE_BRACKET, '').replace(RE_COLON, '');
    }

    function Report({ job, onReset }) {
      const report = job.report || {};
      const paras = useMemo(() => splitParas(job.text), [job.text]);
      const [lit, setLit] = useState(null);
      const hover = useCallback((n, on) => setLit(on ? n : null), []);

      const annots = Array.isArray(report.annots) ? report.annots : [];
      const notesOf = (i) => {
        const a = annots.find((x) => Number(x && x.i) === i);
        return a && Array.isArray(a.notes) ? a.notes : [];
      };
      const noteTotal = annots.reduce((s, a) => s + (Array.isArray(a && a.notes) ? a.notes.length : 0), 0);

      let n = 0;
      const no = () => String(n++).padStart(2, '0');

      const secAnnot = h(
        'section',
        { className: 'zsl-sec', key: 'annot' },
        h(
          'div',
          { className: 'zsl-sec-head' },
          h('span', { className: 'zsl-sec-no' }, no()),
          h('h2', null, '原文批注'),
          h('div', { className: 'zsl-sub' }, '灰色粗体斜体 = 有问题的地方 · 上标编号对应右侧'),
        ),
        h(
          'div',
          { className: 'zsl-rows' },
          paras.map((p, idx) => {
            const notes = notesOf(idx + 1);
            const clean = !notes.length;
            return h(
              'div',
              { className: 'zsl-row', key: idx },
              h('div', { className: 'zsl-body' }, h('p', null, renderMarked(p, notes, hover))),
              h(
                'div',
                { className: 'zsl-notes' },
                clean
                  ? h('div', { className: 'zsl-clean' }, '这一段没有问题')
                  : notes.map((nt) =>
                      h(
                        'div',
                        { key: nt.n, className: 'zsl-note' + (lit === nt.n ? ' lit' : '') },
                        h(
                          'div',
                          { className: 'zsl-nn' },
                          String(nt.n),
                          nt.tag ? h('span', { className: 'zsl-tag' }, ' ' + nt.tag) : null,
                        ),
                        h('p', null, nt.text),
                      ),
                    ),
              ),
            );
          }),
        ),
      );

      const rw = Array.isArray(report.rewrite) ? report.rewrite : [];
      const secRw = rw.length
        ? h(
            'section',
            { className: 'zsl-sec zsl-rw', key: 'rw' },
            h(
              'div',
              { className: 'zsl-sec-head' },
              h('span', { className: 'zsl-sec-no' }, no()),
              h('h2', null, '改写版'),
              h('div', { className: 'zsl-sub' }, '左栏可直接读 · 右栏是这么改的理由'),
            ),
            h(
              'div',
              { className: 'zsl-rows' },
              rw.map((r, i) =>
                h(
                  'div',
                  { className: 'zsl-row', key: i },
                  h(
                    'div',
                    { className: 'zsl-body' },
                    (r.paras || []).map((pp, j) => h('p', { key: j }, String(pp))),
                  ),
                  h(
                    'div',
                    { className: 'zsl-notes' },
                    h(
                      'ul',
                      { className: 'zsl-why' },
                      (r.why || []).map((w, j) => h('li', { key: j }, String(w))),
                    ),
                  ),
                ),
              ),
            ),
          )
        : null;

      const sum = Array.isArray(report.summary) ? report.summary : [];
      const secSum = sum.length
        ? h(
            'section',
            { className: 'zsl-sec', key: 'sum' },
            h(
              'div',
              { className: 'zsl-sec-head' },
              h('span', { className: 'zsl-sec-no' }, no()),
              h('h2', null, '内容总结'),
              h('div', { className: 'zsl-sub' }, '它到底在说什么'),
            ),
            h('ol', { className: 'zsl-sum' }, sum.map((s, i) => h('li', { key: i }, String(s)))),
          )
        : null;

      const facts = Array.isArray(report.facts) ? report.facts : [];
      const secFacts = facts.length
        ? h(
            'section',
            { className: 'zsl-sec', key: 'facts' },
            h(
              'div',
              { className: 'zsl-sec-head' },
              h('span', { className: 'zsl-sec-no' }, no()),
              h('h2', null, '事实与数据核对'),
              h('div', { className: 'zsl-sub' }, '说法 · 判定 · 依据'),
            ),
            h(
              'table',
              { className: 'zsl-facts' },
              h('thead', null, h('tr', null, h('th', null, '原文说法'), h('th', null, '判定'), h('th', null, '依据'))),
              h(
                'tbody',
                null,
                facts.map((f, i) =>
                  h(
                    'tr',
                    { key: i },
                    h('td', null, String(f.claim || '')),
                    h('td', { className: 'v ' + (f.kind || 'bad') }, String(f.verdict || '')),
                    h('td', null, String(f.basis || '')),
                  ),
                ),
              ),
            ),
          )
        : null;

      const adv = Array.isArray(report.advice) ? report.advice : [];
      const secAdv = adv.length
        ? h(
            'section',
            { className: 'zsl-sec', key: 'adv' },
            h(
              'div',
              { className: 'zsl-sec-head' },
              h('span', { className: 'zsl-sec-no' }, no()),
              h('h2', null, '中文表达建议'),
              h('div', { className: 'zsl-sub' }, '每条都给一个能当场做的动作'),
            ),
            h(
              'ol',
              { className: 'zsl-adv' },
              adv.map((a, i) =>
                h(
                  'li',
                  { key: i },
                  h(
                    'div',
                    null,
                    h('p', { className: 'zsl-at' }, String(a.t || '')),
                    a.body ? h('p', { className: 'zsl-ab' }, String(a.body)) : null,
                    a.how ? h('div', { className: 'zsl-how' }, h('b', null, '怎么查'), String(a.how)) : null,
                  ),
                ),
              ),
            ),
          )
        : null;

      const byline0 = Array.isArray(report.byline) ? report.byline : [];
      const byline = byline0.slice(0, 5);
      const title = String(report.title || '报告');
      const accent = String(report.titleAccent || '');
      const at = accent ? title.indexOf(accent) : -1;

      return h(
        'div',
        { className: 'zsl', key: 'screen' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'zsl-wrap' },
          h(Mast),
          h(
            'div',
            { className: 'zsl-rep-head' },
            h(
              'h1',
              null,
              at >= 0
                ? [title.slice(0, at), h('em', { key: 'a' }, accent), title.slice(at + accent.length)]
                : title,
            ),
            byline.length
              ? h(
                  'div',
                  { className: 'zsl-byline' },
                  byline.map((b, i) => [i ? h('i', { key: 'i' + i }, '·') : null, h('span', { key: b + i }, String(b))]),
                )
              : null,
            h(
              'div',
              { className: 'zsl-bar' },
              h('span', null, `${MODES[job.mode] ? MODES[job.mode].name : ''} · ${noteTotal} 条批注`),
              h('span', { className: 'zsl-grow' }),
              h('button', { className: 'zsl-btn primary', type: 'button', onClick: () => exportHTML(job, { paras, noteTotal }) }, '导出 HTML'),
              h('button', { className: 'zsl-btn', type: 'button', onClick: () => exportMarkdown(job, { paras, noteTotal }) }, '导出 Markdown'),
              h('button', { className: 'zsl-btn', type: 'button', onClick: onReset }, '换一篇'),
            ),
          ),
          Array.isArray(report.verdict) && report.verdict.length
            ? h(
                'div',
                { className: 'zsl-verdict' },
                report.verdict.map((v, i) =>
                  h(
                    'p',
                    { key: i },
                    h('span', { className: 'lb' }, VLAB[i] || '\u3000'),
                    h('span', { className: 'tx' }, stripVerdictLabel(String(v))),
                  )),
              )
            : null,
          secAnnot,
          secRw,
          secSum,
          secFacts,
          secAdv,
          h(
            'footer',
            { className: 'zsl-foot' },
            h('span', null, '指标由本地引擎实测 · 判断与改写由模型撰写'),
            h('span', null, `任务 ${job.id} · ${new Date(job.createdAt).toLocaleString('zh-CN')}`),
          ),
        ),
      );
    }

    /* ── 导出 ─────────────────────────────────────────── */

    function download(name, mime, body) {
      const blob = new Blob([body], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function slug(job) {
      const t = String((job.report && job.report.title) || '报告').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
      return `双镜批注本-${t || 'report'}`;
    }

    /** 导出为自包含 HTML：同一套样式、同一份排版，离线可读，可直接打印成 PDF。 */
    function exportHTML(job, meta) {
      const report = job.report || {};
      const paras = meta.paras;
      const annots = Array.isArray(report.annots) ? report.annots : [];
      const notesOf = (i) => {
        const a = annots.find((x) => Number(x && x.i) === i);
        return a && Array.isArray(a.notes) ? a.notes : [];
      };
      let n = 0;
      const no = () => String(n++).padStart(2, '0');

      const marked = (p, notes) =>
        segmentsOf(p, notes)
          .map((s) => (s.n == null ? esc(s.text) : `<mark class="zsl-mark">${esc(s.text)}</mark><sup class="zsl-sup">${s.n}</sup>`))
          .join('');

      const rows = paras
        .map((p, i) => {
          const notes = notesOf(i + 1);
          const right = notes.length
            ? notes
                .map((nt) => `<div class="zsl-note"><div class="zsl-nn">${nt.n}${nt.tag ? `<span class="zsl-tag"> ${esc(nt.tag)}</span>` : ''}</div><p>${esc(nt.text)}</p></div>`)
                .join('')
            : '<div class="zsl-clean">这一段没有问题</div>';
          return `<div class="zsl-row"><div class="zsl-body"><p>${marked(p, notes)}</p></div><div class="zsl-notes">${right}</div></div>`;
        })
        .join('');

      const rw = (Array.isArray(report.rewrite) ? report.rewrite : [])
        .map(
          (r) =>
            `<div class="zsl-row"><div class="zsl-body">${(r.paras || []).map((x) => `<p>${esc(x)}</p>`).join('')}</div><div class="zsl-notes"><ul class="zsl-why">${(r.why || []).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div></div>`,
        )
        .join('');

      const sum = (Array.isArray(report.summary) ? report.summary : []).map((s) => `<li>${esc(s)}</li>`).join('');
      const facts = (Array.isArray(report.facts) ? report.facts : [])
        .map((f) => `<tr><td>${esc(f.claim)}</td><td class="v ${esc(f.kind || 'bad')}">${esc(f.verdict)}</td><td>${esc(f.basis)}</td></tr>`)
        .join('');
      const adv = (Array.isArray(report.advice) ? report.advice : [])
        .map(
          (a) =>
            `<li><div><p class="zsl-at">${esc(a.t)}</p>${a.body ? `<p class="zsl-ab">${esc(a.body)}</p>` : ''}${a.how ? `<div class="zsl-how"><b>怎么查</b>${esc(a.how)}</div>` : ''}</div></li>`,
        )
        .join('');

      const byline = (Array.isArray(report.byline) ? report.byline : []).slice(0, 5).map((b) => `<span>${esc(b)}</span>`).join('<i>·</i>');
      const title = String(report.title || '报告');
      const accent = String(report.titleAccent || '');
      const at = accent ? title.indexOf(accent) : -1;
      const titleHTML = at >= 0 ? esc(title.slice(0, at)) + `<em>${esc(accent)}</em>` + esc(title.slice(at + accent.length)) : esc(title);

      const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}
.zsl{height:auto;min-height:100%;overflow:visible;background:#FAF7F1}
@media print{.zsl-bar{display:none}.zsl{background:#fff}.zsl-wrap{max-width:none}.zsl-sec,.zsl-row{break-inside:avoid}}
</style></head><body style="margin:0">
<div class="zsl"><div class="zsl-wrap">
<header class="zsl-mast"><div class="zsl-seal"><span>双</span><span>镜</span></div>
<div><h1>双镜批注本</h1><div class="zsl-eyebrow">Dual-Lens Chinese Tool · 中文表达双镜片</div></div></header>
<div class="zsl-rep-head"><h1>${titleHTML}</h1><div class="zsl-byline">${byline}</div>
<div class="zsl-bar"><span>${MODES[job.mode] ? MODES[job.mode].name : ''} · ${meta.noteTotal} 条批注</span></div></div>
${(report.verdict || []).length ? `<div class="zsl-verdict">${report.verdict.map((v) => `<p>${esc(v)}</p>`).join('')}</div>` : ''}
<section class="zsl-sec"><div class="zsl-sec-head"><span class="zsl-sec-no">${no()}</span><h2>原文批注</h2><div class="zsl-sub">灰色粗体斜体 = 有问题的地方 · 上标编号对应右侧</div></div><div class="zsl-rows">${rows}</div></section>
${rw ? `<section class="zsl-sec zsl-rw"><div class="zsl-sec-head"><span class="zsl-sec-no">${no()}</span><h2>改写版</h2><div class="zsl-sub">左栏可直接读 · 右栏是这么改的理由</div></div><div class="zsl-rows">${rw}</div></section>` : ''}
${sum ? `<section class="zsl-sec"><div class="zsl-sec-head"><span class="zsl-sec-no">${no()}</span><h2>内容总结</h2></div><ol class="zsl-sum">${sum}</ol></section>` : ''}
${facts ? `<section class="zsl-sec"><div class="zsl-sec-head"><span class="zsl-sec-no">${no()}</span><h2>事实与数据核对</h2></div><table class="zsl-facts"><thead><tr><th>原文说法</th><th>判定</th><th>依据</th></tr></thead><tbody>${facts}</tbody></table></section>` : ''}
${adv ? `<section class="zsl-sec"><div class="zsl-sec-head"><span class="zsl-sec-no">${no()}</span><h2>中文表达建议</h2></div><ol class="zsl-adv">${adv}</ol></section>` : ''}
<footer class="zsl-foot"><span>指标由本地引擎实测 · 判断与改写由模型撰写</span><span>${esc(new Date(job.createdAt).toLocaleString('zh-CN'))}</span></footer>
</div></div></body></html>`;

      download(`${slug(job)}.html`, 'text/html', body);
    }

    function exportMarkdown(job) {
      const r = job.report || {};
      const paras = splitParas(job.text);
      const annots = Array.isArray(r.annots) ? r.annots : [];
      const notesOf = (i) => {
        const a = annots.find((x) => Number(x && x.i) === i);
        return a && Array.isArray(a.notes) ? a.notes : [];
      };
      const L = [];
      L.push(`# ${r.title || '报告'}`, '');
      if (Array.isArray(r.byline) && r.byline.length) L.push(r.byline.join(' · '), '');
      if (Array.isArray(r.verdict)) r.verdict.forEach((v) => L.push(String(v), ''));

      L.push('## 原文批注', '');
      paras.forEach((p, i) => {
        const notes = notesOf(i + 1);
        let out = p;
        // 从后往前替换，避免位置错位
        const hits = segmentsOf(p, notes).filter((s) => s.n != null);
        L.push(`**段落 ${i + 1}**`, '', out, '');
        if (!notes.length) L.push('_这一段没有问题_', '');
        else notes.forEach((nt) => L.push(`- **${nt.n}. ${nt.tag || ''}** — ${nt.text}`));
        if (notes.length) L.push('');
      });

      if (Array.isArray(r.rewrite) && r.rewrite.length) {
        L.push('## 改写版', '');
        r.rewrite.forEach((x) => {
          (x.paras || []).forEach((pp) => L.push(pp, ''));
          if (Array.isArray(x.why) && x.why.length) {
            x.why.forEach((w) => L.push(`> ${w}`));
            L.push('');
          }
        });
      }
      if (Array.isArray(r.summary) && r.summary.length) {
        L.push('## 内容总结', '');
        r.summary.forEach((s, i) => L.push(`${i + 1}. ${s}`));
        L.push('');
      }
      if (Array.isArray(r.facts) && r.facts.length) {
        L.push('## 事实与数据核对', '', '| 原文说法 | 判定 | 依据 |', '| --- | --- | --- |');
        r.facts.forEach((f) => L.push(`| ${f.claim || ''} | ${f.verdict || ''} | ${f.basis || ''} |`));
        L.push('');
      }
      if (Array.isArray(r.advice) && r.advice.length) {
        L.push('## 中文表达建议', '');
        r.advice.forEach((a, i) => {
          L.push(`${i + 1}. **${a.t}**`, '', String(a.body || ''));
          if (a.how) L.push('', `> 怎么查：${a.how}`);
          L.push('');
        });
      }
      L.push('---', '', '指标由本地引擎实测 · 判断与改写由模型撰写');
      download(`${slug(job)}.md`, 'text/markdown', L.join('\n'));
    }

    /* ── 根组件 ───────────────────────────────────────── */

    function Root() {
      const [screen, setScreen] = useState('input');
      const [job, setJob] = useState(null);
      const [error, setError] = useState(null);
      const [elapsed, setElapsed] = useState(0);
      const [step, setStep] = useState(0);
      const [mode, setMode] = useState('rig');
      const [lastRun, setLastRun] = useState(null);
      const timer = useRef(null);
      const poll = useRef(null);

      const stop = () => {
        if (timer.current) clearInterval(timer.current);
        if (poll.current) clearInterval(poll.current);
        timer.current = null;
        poll.current = null;
      };
      useEffect(() => stop, []);

      const start = useCallback(async (picked, text, stats) => {
        setError(null);
        setLastRun({ picked, text, stats });
        setMode(picked === 'pop' ? 'pop' : 'rig');
        setScreen('wait');
        setStep(0);
        setElapsed(0);
        const t0 = Date.now();
        timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);

        try {
          const res = await fetch(API + '/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text, mode: picked, metrics: stats || null }),
          });
          const data = await res.json();
          if (!data.ok && data.error) {
            stop();
            setError(data.error);
            setStep(0);
            return;
          }
          setStep(1);
          const id = data.jobId;
          poll.current = setInterval(async () => {
            try {
              const r = await fetch(`${API}/job?id=${encodeURIComponent(id)}`);
              const d = await r.json();
              if (!d.ok) return;
              const j = d.job;
              if (j.status === 'done' && j.report) {
                stop();
                setStep(3);
                rememberJob(id);
                setJob(j);
                setScreen('report');
              } else if (j.status === 'error') {
                stop();
                setError(j.error || '生成失败');
                /* 不把 step 打回 0：它已经走到哪就停在哪。
                   回零会让"跑了 138 秒才失败"看起来像"一步都没开始"。 */
              } else if (j.status === 'working' || j.status === 'running') {
                setStep(2);
              }
            } catch {
              /* 轮询失败不致命，下一轮再试 */
            }
          }, 1500);
        } catch (e) {
          stop();
          setError('无法连接宿主：' + (e && e.message ? e.message : e));
        }
      }, []);

      // 面板一刷就清空，等于每次都要重新花一次模型调用；记住上一份报告，回来接着看。
      useEffect(() => {
        const id = loadRememberedJob();
        if (!id) return;
        let alive = true;
        (async () => {
          try {
            const r = await fetch(`${API}/job?id=${encodeURIComponent(id)}`);
            const d = await r.json();
            if (alive && d.ok && d.job && d.job.report && d.job.status === 'done') {
              setJob(d.job);
              setScreen('report');
            }
          } catch {
            /* 读不到就当没有，停在输入页 */
          }
        })();
        return () => {
          alive = false;
        };
      }, []);

      const reset = useCallback(() => {
        stop();
        rememberJob(null);
        setJob(null);
        setError(null);
        setElapsed(0);
        setStep(0);
        setScreen('input');
      }, []);

      if (screen === 'report' && job) return h(Report, { job, onReset: reset });
      if (screen === 'wait') {
        return h(ScreenWait, {
          mode,
          elapsed,
          step,
          error,
          onBack: reset,
          onRetry: lastRun ? () => start(lastRun.picked, lastRun.text, lastRun.stats) : null,
        });
      }

      // 处理中也可能是刚提交、job 还没回来
      return h(ScreenInput, { onPick: start, busy: false, error });
    }

    /* ── 记住上一份报告 ───────────────────────────────── */

    const RECENT_KEY = 'zh-sci-lens:lastJob';

    function rememberJob(id) {
      try {
        if (id) window.localStorage.setItem(RECENT_KEY, String(id));
        else window.localStorage.removeItem(RECENT_KEY);
      } catch {
        /* 隐私模式下 localStorage 会抛，忽略即可 */
      }
    }

    function loadRememberedJob() {
      try {
        return window.localStorage.getItem(RECENT_KEY);
      } catch {
        return null;
      }
    }

    /* ── 侧边栏图标 ───────────────────────────────────── */

    function PanelIcon(props) {
      const size = (props && props.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 6.1, cy: 8, r: 4.1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 9.9, cy: 8, r: 4.1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 6.1, cy: 8, r: 1.1, fill: 'currentColor' }),
        h('circle', { cx: 9.9, cy: 8, r: 1.1, fill: 'currentColor' }),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'zh-sci-lens', order: 31, label: '双镜批注本' },
            PanelIcon,
          ),
        );
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'zh-sci-lens' }, Root),
        );
      },
    };
  },
});
