/* ==== zh-sci-lens 引擎移植层（逐条对照 core/zh_sci_lens.py）==== */
/* =====================================================================
   zh-sci-lens · 引擎移植层（逐条对照 core/zh_sci_lens.py）
   ===================================================================== */
const SLX = (function(){
"use strict";
const ORIG_PARAS = ["简报思路", "目标设定——AI工具探索——AI辅助学习skill制作——在学习中优化skill——利用skill精进语言表达", "目标设定部分：", "给出常见的两种表达学术内容的例子，指出常见的学术表达容易陷入以下两个极端：", "1.伪学术（虚张声势）：堆砌大量空洞的宏观词汇或不必要的专业名词，用来掩盖逻辑漏洞。这种文本表面上“高大上”，但经不起同行评议的追问（同行一问具体机制就会露馅）。", "2.硬科普（丧失严谨）：为了让普通人听懂，把核心科学概念过度通俗化、比喻化，导致概念失真，失去了学术研究的边界条件。", "例子一：", "以图片呈现，以下是截图", "菌中的鞭毛马达是一种分子机器，它通过旋转螺旋状纤维来为像大肠杆菌这样的细菌提供动力。马达的旋转通常由离子驱动，这些离子通过电化学梯度传递，从而产生扭矩，这种效应被称为质子动力力。虽然已经有很多研究致力于理解质子转运与扭矩生成之间的关联，但仍有许多生化细节尚未明了，许多问题仍然没有答案。其中一个重要问题就是离子转运是否是协同进行的，即质子是单独移动还是成群移动。在这里，我们提出了一个简化的扭矩生成物理模型（见图 1 ），该模型不仅解释了之前的一系列实验观察结果，而且还提出了一种测量质子转运协同性的方法。具体来说，该模型预测在低负载情况下，电机的扩散过程主要由质子射击噪声驱动，而这种噪声与质子的协同作用存在强烈的二次方依赖性。", "例子二：", "今天，带你走进能让人死而复生的天体，白洞。", "白洞可以让死去的人复活，但前提是你需要在洞口等待100亿年，甚至一直等到宇宙彻底终结。因为白洞就是时间倒着流的黑洞，任何掉进黑洞的东西，理论上都会从白洞里原封不动地吐出来。逝去的亲人，消失的文明，甚至恐龙，全在里面排队。更疯狂的是，从白洞的视角看，他们从没死过，只是被困在了时间的另一面。", "这不是科幻，而是爱因斯坦相对论亲手写下的宇宙法则。1916年一战战场上，一名发着高烧、濒临死亡的德国士兵，在炮火间隙解出了广义相对论史上第一个完整答案，他叫施瓦西。他不仅算出了黑洞，更在方程里发现了一个恐怖的对称体——时间反向流动的天体。只要方程允许黑洞存在，白洞就必须存在，就像有光就必有影，有正面就必有反面。", "1964年，苏联物理学家诺维科夫用严密计算再次确认，白洞不是幻想，而是数学上无法抹杀的真实。可人类找了它整整一百年，却连一丝影子都没看见。不是它藏得深，而是它一出现就会杀死自己。白洞疯狂向外喷射物质，可这些物质会在引力作用下瞬间坍缩在白洞外层，直接裹成一个黑洞。从外面看，它和普通黑洞一模一样。你以为它在吞噬，其实它在拼命释放。", "更绝望的是，白洞触犯了宇宙最不能碰的铁律——热力学第二定律。宇宙只允许混乱越来越多，不允许破碎自动复原。黑洞是乖乖听话的宇宙清道夫，把有序变成混乱；而白洞是逆天而行的叛逆者，把混乱强行拼回有序。它在逆转时间，反抗熵增，改写宇宙底层规则。这也是为什么主流物理学界一度认为，白洞根本不被允许存在。", "但宇宙远比人类疯狂。2006年，NASA卫星捕捉到一场颠覆所有认知的宇宙爆炸，编号GRB 060614。普通伽马射线爆只持续几秒，而它足足燃烧了102秒。最诡异的是，爆炸中心空无一物，没有超新星，没有中子星，没有黑洞，什么都没有。就像虚空突然裂开，喷涌出滔天能量，又瞬间闭合消失。科学家终于意识到，这不是普通爆炸，这是白洞一闪而逝的尸体。", "真正颠覆世界观的是宇宙起源的终极秘密。越来越多顶尖物理学家相信，我们的宇宙大爆炸本身就是一场白洞爆发。在我们的宇宙之前，还存在过一个更古老的宇宙，它不断坍缩、压缩，最终在极限密度下反弹，黑洞瞬间变成白洞。那一场惊天喷发，就是我们宇宙的诞生。你身上的每一个原子，每一丝能量，都来自上一个宇宙的残骸。我们都是从前世宇宙的黑洞里掉进去，被现在的宇宙白洞吐出来的人。黑洞吞噬死亡，白洞创造新生，宇宙就在一吸一吐之间永恒循环。", "但最恐怖的真相来了：白洞的复活从来不是救赎，而是最残酷的惩罚。根据相对论，掉进黑洞的0.1秒，等于外界的1000亿年。当你从白洞被吐出来时，太阳早已熄灭，银河系早已粉碎，你爱的人，你的故乡，你的文明，连一粒灰尘都不会剩下。你确实复活了，却成了全宇宙最孤独的幽灵。", "更让人脊背发凉的是，穿越黑洞与白洞的过程中，你的身体会被引力撕成粒子，再被强行重组。你的记忆、情感、意识还能剩下多少？从白洞里走出来的，真的还是你认识的那个人吗？还是一个被千亿年孤独彻底摧毁的陌生怪物？白洞能复活肉体，却救不回灵魂。", "直到今天，白洞依然是宇宙最大的谜。它可能藏在每一次神秘爆炸里，可能藏在宇宙诞生的起点，可能藏在每一个黑洞的终点，也可能它只是数学上一场美丽却无法实现的梦。但它带给我们的从来不是永生的希望，而是一句最清醒的提醒：与其等待百亿年后一场虚无缥缈的复活，不如珍惜此刻你能拥抱、能看见、能陪伴的每一秒。在这个浩瀚又冷漠的宇宙里，唯一真正珍贵、永远不可逆的，从来不是重生，而是你正在拥有的现在。", "弱项诊断", "1.“伪学术”倾向（虚张声势、拒绝说人话）", "具体表现：堆砌空洞的宏观词汇（如“全方位赋能、多维度体系化推进”）或冗长的嵌套定语，用假大空的排比掩盖实质逻辑的苍白。", "2.“硬科普”倾向（过度通俗、概念严重失真）", "具体表现：为了让普通人秒懂，生硬使用大众化比喻（如把复杂的物理场或神经机制比作“吸尘器”或“开关”），彻底剥离了科学研究赖以成立的边界条件、概率区间与限定前提。", "工具探索", "1.使用Gemini、deepseek等工具后发现现有的chatbot工具存在不足，不足根据实际展示的案例决定", "2.选择使用Agent工具，人与Agent在协同中共同进步：人向agent询问修改办法，对agent的修改进行学习和反馈；agent根据人类的反馈优化语言表达的内容，进一步将严谨易懂的学术表达规则形成一个skill。", "人机协作的反思", "AI 扮演的角色：", "诊段期：文本审计员（定位冗余）。", "执行期：脚手架搭建者（提供同义重构视角）。", "复盘期：对立审稿人（测试边界条件）。", "提示词（Prompt）迭代体会：", "从单一指令（“帮我改精简”）升级为 结构化双重约束 Prompt（指定目标受众、保留术语底线、控制句子长度）。", "AI 的优点与局限：", "优点：极高的高频词汇替换效率与句式重构灵活性。", "局限：缺乏对特定前沿学科微观机制的真实物理理解，仍需人工进行严谨性终审", "学习成果展示", "成果矩阵对照表（文本“瘦身与重构”前后对比）：", "示例展示：展现一段高密度学术段落修改前后的对比（从 180 字压缩至 95 字，信息量零损失，阅读难度下降 50%）。", "应用场景拓宽： 展示该skill在学术口头汇报讲稿、论文 Abstract 撰写以及跨学科交流中的实际提升效果，指出该skill可以辅助他人学习学术表达的亲社会价值和不同学术场景的兼容性"];

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
window.SLX = SLX;
window.ORIG_PARAS = SLX.ORIG_PARAS;


// ---------- 原文注解数据 ----------
const ANNOT = [
  {i:10, tag:'shallow', text:'今天，带你走进能让人死而复生的天体，白洞。', reasons:['「死而复生」是原文自己加的承诺，广义相对论里没有','第二人称「带你」是趣味来源，删掉它要还回来']},
  {i:11, tag:'shallow', text:'白洞可以让死去的人复活，但前提是你需要在洞口等待100亿年…', reasons:['情绪词 1 处：疯狂','100亿年无参照系，属伪精确换算','「全在里面排队」把时间反演字面化']},
  {i:12, tag:'shallow', text:'这不是科幻，而是爱因斯坦相对论亲手写下的宇宙法则…', reasons:['破折号 1 处（行文破折号，应改句号）','「亲手写下」「恐怖的对称体」是情绪替代论证','1916 年施瓦西解 ≠ 发现白洞，归因错误']},
  {i:13, tag:'shallow', text:'1964年，苏联物理学家诺维科夫用严密计算再次确认…', reasons:['「数学上无法抹杀的真实」是从数学存在偷换到物理存在','「你以为它在吞噬，其实它在拼命释放」是修辞替代事实']},
  {i:14, tag:'shallow', text:'更绝望的是，白洞触犯了宇宙最不能碰的铁律——热力学第二定律…', reasons:['情绪词 3 处：绝望、叛逆者、逆天而行','破折号 1 处','「必然违反」是过度简化，文献有相反讨论']},
  {i:15, tag:'shallow', text:'但宇宙远比人类疯狂。2006年，NASA卫星捕捉到…', reasons:['情绪词 2 处：疯狂、诡异','「科学家终于意识到」把一篇论文的推测写成共识']},
  {i:16, tag:'thin', text:'真正颠覆世界观的是宇宙起源的终极秘密…', reasons:['「越来越多顶尖物理学家相信」无出处','圈量子宇宙学的大反弹是高度推测，此处未作限定']},
  {i:17, tag:'shallow', text:'但最恐怖的真相来了：白洞的复活从来不是救赎…', reasons:['情绪词 4 处：恐怖、孤独、幽灵','0.1 秒=1000 亿年 是无参照系的伪换算']},
  {i:18, tag:'shallow', text:'更让人脊背发凉的是，穿越黑洞与白洞的过程中…', reasons:['情绪词 3 处：脊背发凉、摧毁、怪物','「灵魂」不在物理讨论范围内']},
  {i:19, tag:'thin', text:'直到今天，白洞依然是宇宙最大的谜…', reasons:['「可能藏在…可能藏在…可能藏在」是排比填充，信息量接近 0','结尾转向鸡汤，与主题无关']}
];

const el = document.getElementById('annots');
ANNOT.forEach(a=>{
  const d = document.createElement('div');
  d.className = 'p';
  const tagText = a.tag==='hard'?'太难懂':a.tag==='shallow'?'不严谨':'信息量低';
  d.innerHTML = `
    <div class="p-head">
      <span>段落 [${a.i}]</span>
      <span class="tags"><span class="tag ${a.tag}">${tagText}</span></span>
    </div>
    <div class="p-body">${a.text.replace(a.text, '<mark class="problem">'+a.text+'</mark>')}</div>
    <ul class="reasons">${a.reasons.map(r=>`<li>${r}</li>`).join('')}</ul>`;
  d.querySelector('.p-head').onclick = ()=> d.querySelector('.p-body').classList.toggle('hide');
  el.appendChild(d);
});

// ---------- 14 个控件 ----------
const CONTROLS = [
  {id:'unv', name:'绝对化改有条件', need:'engine', gain:60, desc:'「必然/一定/永远」→「在经典图像下/目前」'},
  {id:'cf',  name:'拆分长句',       need:'engine', gain:55, desc:'超 55 字的句子在逗号处切断'},
  {id:'ai',  name:'清除 AI 词',     need:'engine', gain:40, desc:'综上所述/底层逻辑/赋能/抓手'},
  {id:'num', name:'打散编号腔',     need:'engine', gain:35, desc:'首先/其次/其三 → 因果连接'},
  {id:'fil', name:'删冗余状语',     need:'engine', gain:30, desc:'深入地/切实地/有效地/系统性地'},
  {id:'hed', name:'去对冲话术',     need:'engine', gain:25, desc:'某种程度上/应该说/相对而言'},
  {id:'mon', name:'降低术语密度',   need:'model',  gain:45, desc:'术语每千字 >40 时，首次出现加解释'},
  {id:'sub', name:'恢复主语',       need:'model',  gain:50, desc:'被动句/无主句补回动作主体'},
  {id:'met', name:'加可核验细节',   need:'model',  gain:70, desc:'换成具体数字/年份/出处'},
  {id:'ana', name:'加类比（带边界）', need:'model', gain:65, desc:'类比必须附「它不成立的地方」'},
  {id:'dlg', name:'加对话感',       need:'model',  gain:80, desc:'「人们认为」→「你可能会想」'},
  {id:'qst', name:'定义句改提问',   need:'model',  gain:75, desc:'「所谓X是指」→「X 到底是什么？」'},
  {id:'hok', name:'加悬念钩子',     need:'model',  gain:85, desc:'段落末句压到 ≤18 字'},
  {id:'anc', name:'加具体锚点',     need:'model',  gain:72, desc:'年份/秒数/编号/引号内的具体说法'}
];

const cw = document.getElementById('controls');
CONTROLS.forEach(c=>{
  const d = document.createElement('div');
  d.className = 'ctl';
  d.innerHTML = `
    <div class="ctl-top">
      <span class="ctl-id">${c.id}</span>
      <span class="need ${c.need}">${c.need==='engine'?'引擎可执行':'需模型'}</span>
    </div>
    <div class="ctl-name">${c.name}</div>
    <div class="ctl-desc">${c.desc}</div>
    <div class="bar"><i style="width:${c.gain}%"></i></div>`;
  d.onclick = ()=> d.classList.toggle('on');
  cw.appendChild(d);
});