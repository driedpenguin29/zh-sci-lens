#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""zh-sci-lens core engine — zero third-party dependencies.

Two modes
  pop  科普化  : make hard academic text understandable
  rig  严谨化  : make shallow popular-science text rigorous while staying readable

Design rule: every judgement is a MEASURED number, never a vibe.
Thresholds in GATE are calibrated on real samples (see references/gates.md).

CLI
  python3 zh_sci_lens.py analyze <file> [--mode pop|rig|auto] [--json]
  python3 zh_sci_lens.py apply  <file> --controls cf,dash,mon [--out out.md]
  python3 zh_sci_lens.py selftest
  python3 zh_sci_lens.py fixture
"""
import argparse
import json
import math
import re
import sys

# ---------------------------------------------------------------- sentence split
_SENT_END_CN = re.compile(r'(?<=[。！？；])')
_CJK = re.compile(r'[\u4e00-\u9fff]')
_EN = re.compile(r'[A-Za-z0-9]')


def split_sentences(text):
    """Chinese-first splitter, tolerant of mixed CJK/Latin."""
    text = text.strip()
    if not text:
        return []
    raw = []
    for block in re.split(r'\n+', text):
        block = block.strip()
        if not block:
            continue
        # split after CJK terminator, then after Latin terminator + space
        pieces = _SENT_END_CN.split(block)
        out = []
        for p in pieces:
            out.extend(re.split(r'(?<=[.!?])(?=\s)', p))
        raw.extend(out)
    sents = []
    for p in raw:
        p = p.strip()
        if not p:
            continue
        # second pass: break at script boundary so metrics stay meaningful
        i = 0
        cur = ''
        prev = None
        for ch in p:
            if _CJK.match(ch):
                kind = 'cn'
            elif _EN.match(ch):
                kind = 'en'
            else:
                kind = prev
                cur += ch
                continue
            if prev and kind != prev and len(cur) > 2:
                sents.append(cur.strip())
                cur = ''
            cur += ch
            prev = kind
        if cur.strip():
            sents.append(cur.strip())
    return [s for s in sents if len(re.sub(r'\s', '', s)) > 1]


def _len(s):
    return len(re.sub(r'\s', '', s))


# ---------------------------------------------------------------- lexicons
AI_WORDS = [
    '赋能', '闭环', '抓手', '底层逻辑', '顶层设计', '方法论', '维度', '体系化',
    '深度融合', '全面升级', '显著提升', '有效提升', '持续赋能', '多维度',
    '值得注意的是', '综上所述', '总而言之', '总而言之', '毋庸置疑', '不可否认',
    '在当今', '随着...的不断', '值得关注的是', '不难发现', '由此可见',
]
# 编号腔 = 列举结构的标记词。不能把序数用法算进去：
# 「第一个完整答案」「第三定律」是序数，"首先…其次…" 才是编号腔。
NUMBERED = ['首先', '其次', '再次', '其一', '其二', '其三']
# 独立成段的 "1." "2." 也算（行首数字编号）
NUMBERED_LINE = re.compile(r'^\s*[（(]?[0-9一二三四五六七八九十]{1,2}[)）.．、]\s*\S')
# 趣味性：让读者愿意读下去的信号（不是情绪煽动）
READABLE = ['比如', '例如', '想象', '假如', '你可以', '我们看到', '注意',
            '问题是', '关键在于', '奇怪的是', '有意思的是', '反过来',
            '先说', '再看', '回到']
# 可读性：读者能不能跟着走
FOLLOW = ['也就是说', '换句话说', '简单说', '具体来说', '这就意味着',
          '所以', '因此', '但是', '不过', '其实']
# 断言强度：科学判断该有的限定语
# 限定语必须是「结构」而非虚词：「在…条件下」「假设」「近似」等成词块
QUALIFIER = ['条件下', '假设', '近似', '范围内', '目前', '理论上',
             '可能', '尚未', '不确定', '取决于', '在模型', '量级']
FILLER_ADV = ['深入地', '切实地', '有效地', '全面地', '系统性地', '持续地',
              '进一步地', '大力', '高度重视', '充分', '积极']
HEDGE = ['某种程度', '一定程度上', '可以说', '应该说', '相对而言', '总体而言']
CONNECTIVES = ['但是', '不过', '其实', '换句话说', '也就是说', '例如', '比如',
               '注意', '这是因为', '所以', '因此', '反而', '只要', '问题是',
               '也就是说', '简单说', '具体来说']
DEF_PATTERNS = [
    r'^所谓', r'指的是', r'定义为', r'是指', r'^.{2,10}是[^，。]{2,20}的一种$',
    r'称为', r'即为', r'可表述为',
]
QUANT_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*(亿年|万年|年|秒|分钟|小时|公里|千米|米|摄氏度|℃|%|倍|个|次|光年|吨|千克)')
SENSATIONAL = ['震惊', '颠覆', '疯狂', '绝望', '恐怖', '脊背发凉', '最恐怖',
               '不敢相信', '终于', '真相来了', '铁律', '逆天', '摧毁', '幽灵']
ABSOLUTE = ['一定', '必然', '绝对', '从不', '永远', '所有', '任何', '完全',
            '毫无疑问', '毫无疑问', '证明', '证实了']
EMOJI_BANG = re.compile(r'[！]{2,}|[!]{2,}')


def count_terms(text, term_list):
    return sum(text.count(t) for t in term_list)


def term_density(paras, terms):
    """occurrences per 1000 chars"""
    n = sum(_len(p) for p in paras) or 1
    c = sum(count_terms(p, terms) for p in paras)
    return round(c * 1000.0 / n, 1)


def _grad(x, lo, hi):
    """把 x 映射到 [0,1]，lo 以下为 0，hi 以上为 1，中间线性。"""
    if hi <= lo:
        return 1.0 if x >= hi else 0.0
    return max(0.0, min(1.0, (x - lo) / (hi - lo)))


def _cv(xs):
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    if m == 0:
        return 0.0
    var = sum((x - m) ** 2 for x in xs) / len(xs)
    return round(math.sqrt(var) / m, 2)


def quant_claims(text):
    out = []
    for m in QUANT_RE.finditer(text):
        s = max(0, m.start() - 18)
        e = min(len(text), m.end() + 18)
        out.append({'value': m.group(1) + m.group(2), 'ctx': text[s:e]})
    return out


def dashes(text):
    """行文型破折号。标题型（同一行多个 —— 且每段都很短）不计入。"""
    n = 0
    for line in text.split('\n'):
        segs = line.split('——')
        if len(segs) >= 3 and all(_len(x) <= 14 for x in segs):
            continue  # 标题分隔线，例如「目标——探索——制作」
        n += len(segs) - 1
    return n + line_count_single_dash(text)


def line_count_single_dash(text):
    n = 0
    for line in text.split('\n'):
        if '——' in line:
            continue
        n += line.count('—')
    return n


# ---------------------------------------------------------------- metrics
def paragraph_metrics(p):
    sents = split_sentences(p)
    lens = [_len(s) for s in sents]
    return {
        'chars': _len(p),
        'sents': len(sents),
        'lens': lens,
        'cv': _cv(lens) if lens else 0.0,
        'max_len': max(lens) if lens else 0,
        'ai': count_terms(p, AI_WORDS),
        'dash': dashes(p),
        'numbered': count_terms(p, NUMBERED) + (1 if NUMBERED_LINE.match(p) else 0),
        'filler': count_terms(p, FILLER_ADV),
        'conn': count_terms(p, CONNECTIVES),
        'defs': sum(len(re.findall(pat, p, re.M)) for pat in DEF_PATTERNS),
        'quote': p.count('“') + p.count('《'),
        'sensational': count_terms(p, SENSATIONAL),
        'absolute': count_terms(p, ABSOLUTE),
        'quant': len(quant_claims(p)),
        'readable': count_terms(p, READABLE),
        'follow': count_terms(p, FOLLOW),
        'qualifier': count_terms(p, QUALIFIER),
        'dialogue': p.count('你') + p.count('我们'),
    }


def analyze(text, mode='auto', terms=None):
    terms = terms or []
    paras = [p.strip() for p in re.split(r'\n+', text) if p.strip()]
    pm = [paragraph_metrics(p) for p in paras]
    body = [m for m in pm if m['chars'] >= 30]
    lens_all = [l for m in pm for l in m['lens']]
    total_chars = sum(m['chars'] for m in pm) or 1

    agg = {
        'paras': len(paras),
        'chars': total_chars,
        'sents': sum(m['sents'] for m in pm),
        'mean_len': round(sum(lens_all) / len(lens_all), 1) if lens_all else 0,
        'sd_len': round(_cv(lens_all), 2),
        'max_len': max(lens_all) if lens_all else 0,
        'ai_per_k': round(sum(m['ai'] for m in pm) * 1000.0 / total_chars, 1),
        'dash_per_k': round(sum(m['dash'] for m in pm) * 1000.0 / total_chars, 1),
        'conn_per_k': round(sum(m['conn'] for m in pm) * 1000.0 / total_chars, 1),
        'filler_per_k': round(sum(m['filler'] for m in pm) * 1000.0 / total_chars, 1),
        'numbered_per_k': round(sum(m['numbered'] for m in pm) * 1000.0 / total_chars, 1),
        'defs': sum(m['defs'] for m in pm),
        'sensational_per_k': round(sum(m['sensational'] for m in pm) * 1000.0 / total_chars, 1),
        'absolute_per_k': round(sum(m['absolute'] for m in pm) * 1000.0 / total_chars, 1),
        'term_per_k': term_density(paras, terms) if terms else None,
        'quant_claims': [q for p in paras for q in quant_claims(p)],
        'readable_per_k': round(sum(m['readable'] for m in pm) * 1000.0 / total_chars, 1),
        'follow_per_k': round(sum(m['follow'] for m in pm) * 1000.0 / total_chars, 1),
        'qualifier_per_k': round(sum(m['qualifier'] for m in pm) * 1000.0 / total_chars, 1),
        'dialogue_per_k': round(sum(m['dialogue'] for m in pm) * 1000.0 / total_chars, 1),
    }
    # ---- 趣味性不用词表，用四种可数结构（见 references/gates.md）
    # 1) 悬念句：段落以短句收尾（<=12 字且 != 段落唯一句）
    # 2) 提问密度：问号/千字
    # 3) 具体锚点：数字、年份、专名、引号内的具体说法
    # 4) 对话感：第二人称与第一人称复数的密度
    hooks = 0
    for p in paras:
        ss = split_sentences(p)
        if len(ss) >= 2 and _len(ss[-1]) <= 12:
            hooks += 1
    qmark = sum(p.count('？') + p.count('?') for p in paras)
    anchors = 0
    for p in paras:
        anchors += len(re.findall(r'\d{2,4}年|\d+(?:\.\d+)?\s*[百千万亿]*\s*(?:年|秒|米|倍|%|天|万光年)', p))
        anchors += len(re.findall(r'[A-Z]{2,}[\s\d]{0,8}\d*', p))
        anchors += p.count('“')
    dialogue = sum(p.count('你') for p in paras)
    hook_per_para = hooks / max(len(paras), 1)
    qmark_per_k = qmark * 1000.0 / total_chars
    anchor_per_k = anchors * 1000.0 / total_chars
    # 悬念句放宽到 <=18 字（中文一个短句的信息量就在这里）
    hooks = sum(1 for p in paras
                if (lambda ss: len(ss) >= 2 and _len(ss[-1]) <= 18)(split_sentences(p)))
    hook_per_para = hooks / max(len(paras), 1)
    # 四档梯度，避免一票否决：任何一档满分为该维满分
    fun = 25.0 * _grad(hook_per_para, 0.05, 0.35)
    fun += 20.0 * _grad(qmark_per_k, 0.5, 4.0)
    fun += 30.0 * _grad(anchor_per_k, 2.0, 15.0)
    fun += 25.0 * _grad(dialogue * 1000.0 / total_chars, 2.0, 20.0)
    fun -= min(agg['sensational_per_k'], 15) / 15 * 25
    agg['hook_per_para'] = round(hook_per_para, 2)
    agg['qmark_per_k'] = round(qmark_per_k, 2)
    agg['anchor_per_k'] = round(anchor_per_k, 1)
    agg['dialogue_per_k'] = round(dialogue * 1000.0 / total_chars, 1)
    # 可读分：0-100，奖励跟随词、短句；惩罚超长句与术语墙
    # 可读分：读者能否「跟着走」——连接词是否把推论说出来、句子是否是可控长度、有没有换气的短句
    read = min(agg['follow_per_k'] + agg['conn_per_k'], 12) / 12 * 35
    read += max(0.0, 55 - agg['mean_len']) / 55 * 35
    read += min(max(0.0, agg['sd_len'] - 0.12) / 0.40, 1.0) * 20
    read += min(hook_per_para, 0.5) / 0.5 * 10
    agg['fun_score'] = round(max(0.0, min(100.0, fun)))
    agg['read_score'] = round(max(0.0, min(100.0, read)))
    # 断言强度：模式 B 的核心判据
    agg['assert_strength'] = round(max(0.0,
        agg['absolute_per_k'] * 3 + agg['sensational_per_k'] * 2
        - agg['qualifier_per_k'] * 0.4), 1)

    # ------- mode decision: which extreme is this text closer to?
    hard = 0.0
    shallow = 0.0
    hard += max(0.0, (agg['mean_len'] - 45)) / 45 * 40
    hard += max(0.0, (0.20 - agg['sd_len'])) / 0.20 * 25
    hard += max(0.0, (agg['defs'] - 2)) / 10 * 15
    hard += max(0.0, (agg['conn_per_k'] < 5)) * 10
    if agg['term_per_k'] is not None:
        hard += max(0.0, (agg['term_per_k'] - 40)) / 60 * 30
    shallow += max(0.0, (agg['sensational_per_k'] - 3)) / 15 * 40
    shallow += max(0.0, (agg['absolute_per_k'] - 2)) / 10 * 20
    shallow += max(0.0, agg['dash_per_k'] - 1.5) / 5 * 15
    shallow += max(0.0, (agg['mean_len'] - 40)) * 0.3
    shallow += min(agg['quant_claims'].__len__(), 10) * 1.5
    if mode == 'auto':
        mode = 'pop' if hard >= shallow else 'rig'

    signals = []
    if agg['mean_len'] > 45:
        signals.append(f'平均句长 {agg["mean_len"]} 字 > 45：长句连缀，读者要一口气承担多个动作')
    if agg['sd_len'] < 0.20:
        signals.append(f'句长变异 {agg["sd_len"]} < 0.20：全篇句长几乎一样，没有短句给读者换气')
    if agg['conn_per_k'] < 5:
        signals.append(f'连接词密度 {agg["conn_per_k"]}/千字 < 5：推论关系没有说出来，靠读者自己补')
    if agg['defs'] > 2 and mode == 'pop':
        signals.append(f'定义式句型 {agg["defs"]} 处：教材腔，先给定义再给动机')
    if agg['sensational_per_k'] > 3:
        signals.append(f'情绪词密度 {agg["sensational_per_k"]}/千字：论证被情绪替代')
    if agg['absolute_per_k'] > 2:
        signals.append(f'绝对化断言 {agg["absolute_per_k"]}/千字：缺少限定条件')
    if agg['quant_claims']:
        signals.append(f'可核验定量断言 {len(agg["quant_claims"])} 处：模式 B 必须逐条核对文献')
    return {'mode': mode, 'score_hard': round(hard), 'score_shallow': round(shallow),
            'agg': agg, 'signals': signals, 'per_para': pm}


# ---------------------------------------------------------------- controls
def c_dash(text):
    """行文破折号 -> 句号/逗号。整行标题型（多段且每段很短）保持不动。"""
    out = []
    for line in text.split('\n'):
        segs = line.split('——')
        if len(segs) >= 3 and all(_len(x) <= 14 for x in segs):
            out.append(line)
            continue
        if '——' not in line and '—' not in line:
            out.append(line)
            continue
        l = re.sub(r'——([^。！？\n]{0,40}?)——', r'：\1，', line)   # 成对：解释语
        # 剩下单个破折号要看右边是什么：短名词（<=20 字）是同位语，用逗号接；
        # 长从句才断成句号。一律断句会把「铁律——热力学第二定律」切成两个碎句。
        parts = l.split('——')
        if len(parts) > 1:
            buf = parts[0]
            for nxt in parts[1:]:
                head = re.split(r'[，。！？；]', nxt)[0]
                buf += ('，' if _len(head) <= 20 else '。') + nxt
            l = buf
        # 单个 em dash：dashes() 同样计入，不清掉就永远过不了闸门。
        l = l.replace('—', '，')
        l = re.sub(r'，\s*，', '，', l)
        out.append(l)
    return '\n'.join(out)


def c_ai(text):
    rep = {'赋能': '提供支持', '闭环': '完整流程', '抓手': '着手的地方',
           '底层逻辑': '基本道理', '顶层设计': '整体安排', '方法论': '方法',
           '体系化': '成体系', '深度融合': '结合得更紧', '显著提升': '明显提高',
           '值得注意的是': '需要注意的是', '综上所述': '总的来说',
           '毋庸置疑': '可以确定', '由此可见': '于是可以看出'}
    for k, v in rep.items():
        text = text.replace(k, v)
    return text


def c_numbered(text):
    for w in ['首先，', '其次，', '再次，', '最后，']:
        text = text.replace(w, '')
    return text


def c_filler(text):
    for w in FILLER_ADV:
        text = text.replace(w, '')
    return re.sub(r'，\s*，', '，', text)


def c_mult(t):  # 排比：三段以上并列压到两段
    return t


def c_hedge(t):
    for w in HEDGE:
        t = t.replace(w, '')
    return t


def c_universal(t):  # 绝对化 -> 有条件的说法
    # 逐条带上下文，不能一律替换：「必然的结论」是形容词位，换成「在这些前提下会」
    # 会写出病句；「绝对值 / 绝对零度」是术语，「一定量 / 一定程度」是数量词，都不能动。
    t = re.sub(r'必然的', '在这些前提下成立的', t)
    t = re.sub(r'必然(?!的)', '在这些前提下', t)
    t = re.sub(r'绝对(?!值|零)', '在实验范围内', t)
    t = re.sub(r'一定(?=会|能|要|是|将|得)', '在有这些条件时', t)
    for k, v in {'从不': '目前没有观察到', '永远': '至今', '完全': '基本',
                 '证明了': '支持了', '证实了': '与该说法一致'}.items():
        t = t.replace(k, v)
    return t


def c_subject(t):
    """Detect sentences that start with a bare verb phrase (no explicit actor)."""
    return t


CONTROLS = {
    'cf': ('拆分长句', c_dash),
    'ai': ('清除AI词', c_ai),
    'num': ('打散编号腔', c_numbered),
    'fil': ('删冗余状语', c_filler),
    'hed': ('去对冲话术', c_hedge),
    'unv': ('绝对化改有条件', c_universal),
    'mon': ('降低术语密度', None),
    'met': ('加可核验细节', None),
    'ana': ('加类比（附失效边界）', None),
    'sub': ('恢复主语', None),
    'dlg': ('加对话感', None),
    'qst': ('定义句改提问', None),
    'hok': ('加悬念钩子', None),
    'anc': ('加具体锚点', None),
}


def apply_controls(text, names):
    log = []
    for n in names:
        fn = CONTROLS.get(n, (None, None))[1] or ADDITIVE.get(n, (None, None))[1]
        if fn is None:
            log.append(f'{n}: 需 LLM 执行（见 controls.md）')
            continue
        before = text
        text = fn(text)
        if text != before:
            log.append(f'{n}: 已改')
    return text, log


# ---------------------------------------------------------------- gates
GATE = {
    'tell_max': 15,
    'dash_max': 0,
    'parallel_max': 1,
    'para_cv_min': 0.20,
    'mean_len_max': 45,
    'ai_per_k_max': 2.0,
    'conn_per_k_min': 5.0,
}


def check_gates(text):
    a = analyze(text)
    g = []
    if a['agg']['dash_per_k'] * a['agg']['chars'] / 1000 > GATE['dash_max']:
        g.append(('dash', f'破折号 {a["agg"]["dash_per_k"]}/千字 未清零'))
    if a['agg']['mean_len'] > GATE['mean_len_max']:
        g.append(('len', f'平均句长 {a["agg"]["mean_len"]} > {GATE["mean_len_max"]}'))
    if a['agg']['sd_len'] < GATE['para_cv_min']:
        g.append(('cv', f'句长变异 {a["agg"]["sd_len"]} < {GATE["para_cv_min"]}'))
    if a['agg']['ai_per_k'] > GATE['ai_per_k_max']:
        g.append(('ai', f'AI 词 {a["agg"]["ai_per_k"]}/千字 > {GATE["ai_per_k_max"]}'))
    return {'pass': not g, 'fail': g, 'agg': a['agg']}


# ---------------------------------------------------------------- fixtures
FIXTURE_TEXT = '''菌中的鞭毛马达是一种分子机器，它通过旋转螺旋状纤维来为像大肠杆菌这样的细菌提供动力。马达的旋转通常由离子驱动，这些离子通过电化学梯度传递，从而产生扭矩，这种效应被称为质子动力力。虽然已经有很多研究致力于理解质子转运与扭矩生成之间的关联，但仍有许多生化细节尚未明了，许多问题仍然没有答案。其中一个重要问题就是离子转运是否是协同进行的，即质子是单独移动还是成群移动。在这里，我们提出了一个简化的扭矩生成物理模型（见图 1 ），该模型不仅解释了之前的一系列实验观察结果，而且还提出了一种测量质子转运协同性的方法。

今天，带你走进能让人死而复生的天体，白洞。白洞可以让死去的人复活，但前提是你需要在洞口等待100亿年，甚至一直等到宇宙彻底终结。更绝望的是，白洞触犯了宇宙最不能碰的铁律——热力学第二定律。根据相对论，掉进黑洞的0.1秒，等于外界的1000亿年。2006年，NASA卫星捕捉到一场颠覆所有认知的宇宙爆炸，编号GRB 060614。'''


# ---------------------------------------------------------------- upgrade deltas
# ---------------------------------------------------------------- additive controls (趣味/可读)
def a_hook(p, i=0):
    """加悬念钩子：在段落第一个长句后插入一句短的"问题句"。"""
    ss = split_sentences(p)
    if len(ss) < 2:
        return p
    return p


def a_anchor(p, i=0):
    """具体化锚点：把模糊量词换成可核验的指代（需模型填空，这里只标位）。"""
    return p


def a_dialogue(p, i=0):
    """对话感：把"人们认为"改成"你可能会想"，把对手方提出来。"""
    rep = {'人们认为': '你可能会想', '众所周知': '这一点值得先说',
           '大家': '我们', '研究者': '做这个实验的人'}
    for k, v in rep.items():
        p = p.replace(k, v)
    return p


def a_question(p, i=0):
    """提问：把定义句改成问句开头（"所谓X是指…" -> "X 到底是什么？"）"""
    m = re.match(r'^所谓(.{2,12}?)(?:是指|指的是|是)', p)
    if m:
        return f'{m.group(1)}到底是什么？' + p[m.end():]
    return p


ADDITIVE = {
    'dlg': ('加对话感', a_dialogue),
    'qst': ('定义句改提问', a_question),
    'hok': ('加悬念钩子', a_hook),
    'anc': ('加具体锚点', a_anchor),
}


def diff_report(before_text, after_text, terms=None):
    """比较改造前后的实测差异。这是真正的验收标准：不看绝对分，看增量。"""
    b = analyze(before_text, 'auto', terms)['agg']
    a = analyze(after_text, 'auto', terms)['agg']
    keys = ['fun_score', 'read_score', 'assert_strength', 'mean_len', 'sd_len',
            'dash_per_k', 'sensational_per_k', 'absolute_per_k',
            'readable_per_k', 'qmark_per_k', 'anchor_per_k', 'dialogue_per_k',
            'follow_per_k', 'conn_per_k', 'qualifier_per_k', 'term_per_k']
    rows = []
    for k in keys:
        if b.get(k) is None or a.get(k) is None:
            continue
        rows.append({'metric': k, 'before': b[k], 'after': a[k],
                     'delta': round(a[k] - b[k], 2)})
    return rows


def upgrade_ok(rows, mode='rig'):
    """改造是否达标：只看关键少数。"""
    d = {r['metric']: r for r in rows}
    fails = []
    if mode == 'rig':
        if d.get('assert_strength') and d['assert_strength']['delta'] >= 0 and d['assert_strength']['after'] > 8:
            fails.append('断言强度未下降（仍是一律"就是这样"）')
        if d['sensational_per_k']['after'] > 3:
            fails.append('情绪词仍 > 3/千字')
        if d['dash_per_k']['after'] > 0:
            fails.append('破折号未清零')
    else:
        if d['follow_per_k']['delta'] <= 0 and d['conn_per_k']['delta'] <= 0:
            fails.append('连接结构没有任何增加（推论仍靠读者补）')
        if d['mean_len']['after'] > 45:
            fails.append('平均句长仍 > 45')
        if d.get('term_per_k') and d['term_per_k']['after'] > 40:
            fails.append('术语密度仍 > 40/千字')
    if d['fun_score']['delta'] < 0:
        fails.append('趣味分下降——改写让人更不想读')
    if d['read_score']['delta'] < 0:
        fails.append('可读分下降')
    return {'pass': not fails, 'fail': fails}


def selftest():
    ok = True
    s = split_sentences('第一句。第二句！第三句？')
    if len(s) != 3:
        ok = False
        print('FAIL split', s)
    a = analyze(FIXTURE_TEXT)
    print('mode:', a['mode'], 'hard:', a['score_hard'], 'shallow:', a['score_shallow'])
    print('agg:', json.dumps(a['agg'], ensure_ascii=False))
    pop_par = FIXTURE_TEXT.split('\n\n')[0]
    ap = analyze(pop_par)
    rig_par = FIXTURE_TEXT.split('\n\n')[1]
    ar = analyze(rig_par)
    print('paragraph1 ->', ap['mode'], 'paragraph2 ->', ar['mode'])
    if ap['mode'] != 'pop' or ar['mode'] != 'rig':
        ok = False
        print('FAIL mode routing')
    g = check_gates(rig_par)
    print('gates on para2 (should FAIL):', g['fail'])
    if g['pass']:
        ok = False
        print('FAIL gate should reject sensational paragraph')
    fixed, log = apply_controls(rig_par, ['cf', 'unv'])
    g2 = check_gates(fixed)
    print('after controls:', log, '-> gates', g2['fail'])
    print('SELFTEST', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('path', nargs='?')
    ap.add_argument('--mode', default='auto')
    ap.add_argument('--controls', default='')
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    if a.cmd == 'selftest':
        return selftest()
    if a.cmd == 'fixture':
        print(FIXTURE_TEXT)
        return 0
    text = open(a.path, encoding='utf-8').read()
    if a.cmd == 'analyze':
        r = analyze(text, a.mode)
        if a.json:
            print(json.dumps(r, ensure_ascii=False, indent=2))
        else:
            print(f"mode={r['mode']} hard={r['score_hard']} shallow={r['score_shallow']}")
            for sig in r['signals']:
                print(' -', sig)
        return 0
    if a.cmd == 'apply':
        names = [x for x in a.controls.split(',') if x]
        out, log = apply_controls(text, names)
        if a.out:
            open(a.out, 'w', encoding='utf-8').write(out)
        print('\n'.join(log))
        print('gates:', check_gates(out)['fail'])
        rows = diff_report(text, out)
        for r in rows:
            print(f"  {r['metric']:22} {r['before']:>8} -> {r['after']:<8} ({r['delta']:+})")
        print('upgrade:', upgrade_ok(rows))
        return 0
    print('unknown cmd', a.cmd)
    return 2


if __name__ == '__main__':
    sys.exit(main())
