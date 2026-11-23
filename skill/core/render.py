#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""zh-sci-lens dashboard 渲染器（零依赖）。

把「引擎测量结果 + 模型填写的内容规格」渲染成一份自包含 HTML dashboard。
内容规格必须由模型为**当前这段文本**填写；本脚本不做任何判断，只负责排版。

用法：
  python3 core/render.py spec.json -o out.html
  python3 core/render.py spec.json            # 输出到 stdout

内容规格 schema（spec.json）：
{
  "title":      "页面标题",
  "subtitle":   "副标题",
  "mode":       "pop" | "rig",
  "source":     "原始文本全文（引擎会在它上面跑）",
  "variants":   [{"name":"版本名", "text":"该版全文"}],      # 可选，用于并列记分
  "verdict":    "一句话结论（HTML 允许 <b>/<br>）",
  "verdict_kind": "bad" | "warn" | "good" | "",            # 结论框颜色
  "mechanisms": [{"h":"小标题", "body":"正文 HTML", "quote":"实测引用 HTML"}],
  "annots":     [{"i":段号, "tag":"hard|shallow|thin", "text":"该段原文",
                  "reasons":["原因1","原因2"]}],
  "controls_on":["unv","cf"],                               # 默认勾选的控件 id
  "rewrite":    [{"head":"小节名", "tags":"qst + dlg", "body":"改写正文 HTML",
                  "reasons":["为什么这样写：…"]}],
  "advice":     [{"h":"小标题", "body":"正文 HTML"}],
  "facts":      [{"claim":"原文说法", "verdict":"判定", "kind":"bad|mid|ok",
                  "basis":"依据"}],
  "gate_note":  "可选的闸门说明"
}

只填你有的块：缺哪个块，页面上就不渲染哪个块。
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
TPL = os.path.join(SKILL, 'templates')

TAGS = {
    'hard': ('太难懂', 'hard'),
    'shallow': ('不严谨', 'shallow'),
    'thin': ('信息量低', 'thin'),
}
KIND = {'bad': 'bad', 'mid': 'mid', 'ok': 'ok', 'good': 'ok', 'warn': 'mid'}


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def read(name):
    with open(os.path.join(TPL, name), encoding='utf-8') as f:
        return f.read()


def jdump(obj):
    """安全地嵌进 <script>：\u2028/\u2029 与 </script> 都必须转义。"""
    s = json.dumps(obj, ensure_ascii=False)
    return (s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
            .replace('</', '<\\/'))


# ---------- 各块渲染 ----------

def block_verdict(spec):
    v = spec.get('verdict')
    if not v:
        return ''
    kind = KIND.get(spec.get('verdict_kind', ''), '')
    return ('<div class="card"><h2><span class="no">00</span>一句话结论</h2>'
            '<div class="note %s">%s</div></div>' % (kind, v))


def block_variants(spec):
    """并列记分：原文 + 各版本。表内数值由引擎在浏览器里实测填入（占位）。"""
    vs = spec.get('variants') or []
    h = ['<div class="card"><h2><span class="no">00</span>并列记分</h2>'
         '<p style="font-size:12px;color:var(--muted)">'
         '下表每一格都是引擎对相应全文的实测值，不是估计。'
         '阈值来自 references/gates.md。</p>'
         '<div id="vtable"></div></div>']
    return ''.join(h)


def block_summary(spec):
    items = spec.get('summary') or []
    if not items:
        return ''
    lis = ''.join('<li>%s</li>' % x for x in items)
    return ('<div class="card"><h2><span class="no">00</span>内容总结</h2>'
            '<p class="lede">这段文字实际说了什么。先看清它在说什么，再看它哪里没说清。</p>'
            '<ol class="sumlist">%s</ol></div>' % lis)


def block_mechanisms(spec):
    ms = spec.get('mechanisms') or []
    if not ms:
        return ''
    items = []
    for m in ms:
        q = ('<p class="quote">%s</p>' % m['quote']) if m.get('quote') else ''
        items.append('<div><h3>%s</h3><p>%s</p>%s</div>'
                     % (esc(m.get('h', '')), m.get('body', ''), q))
    return ('<div class="card"><h2><span class="no">00</span>为什么会这样</h2>'
            '<div class="grid2">%s</div></div>' % ''.join(items))


def block_annots(spec):
    tags = ''.join('<span class="tag %s">%s</span>' % (k, TAGS[k][0])
                   for k in ('hard', 'shallow', 'thin'))
    return ('<div class="card"><h2><span class="no">00</span>原文注解</h2>'
            '<p class="lede"><mark class="problem">灰色粗体斜体</mark> = 有问题。'
            '点标题行可折叠。标签：' + tags + '</p>'
            '<div class="btnbar" style="margin-top:0">'
            '<button class="btn ghost" id="btn-ann-expand">全部展开</button>'
            '<button class="btn ghost" id="btn-ann-collapse">全部收起</button>'
            '</div><div id="annots"></div></div>')


def block_controls(spec):
    return ('<div class="card"><h2><span class="no">00</span>润色控件</h2>'
            '<p style="font-size:12px;color:var(--muted);margin-bottom:var(--sp-md)">'
            '点一下可以开关。<span class="need engine">引擎可执行</span> 表示本机 '
            '<code>apply_controls()</code> 能直接跑；<span class="need model">需模型</span> '
            '表示配方已定，但执行必须由模型完成（正则做不到）。</p>'
            '<div class="ctrl" id="controls"></div>'
            '<div class="btnbar">'
            '<button class="btn" id="btn-engine">只跑引擎可执行项</button>'
            '<button class="btn" id="btn-all">全选</button>'
            '<button class="btn" id="btn-none">清空</button>'
            '<button class="selall" id="btn-copy" style="margin-left:auto">'
            '复制「需模型」任务清单</button></div>'
            '<h3 style="margin-top:var(--sp-lg)">实时记分板</h3>'
            '<div class="scorebar" id="scorebar"></div>'
            '<div class="gates" id="gates"></div>'
            '<h3 style="margin-top:var(--sp-lg)">执行结果</h3>'
            '<div class="outbox" id="outbox">在上方选好控件，点「只跑引擎可执行项」，'
            '或手动改下面文本框里的段落再试。</div>'
            '<div class="modelnote" id="modelnote"></div>'
            '<div class="note quiet"><b>组合顺序很重要</b>：先事实层'
            '（<code>unv → mon → sub</code>），再句法层'
            '（<code>cf → ai → num → fil → hed</code>），最后修辞层'
            '（<code>met → ana → dlg → qst → hok → anc</code>）。'
            '先加类比后改条件，会把错的类比固化下来。</div></div>')


def block_source(spec):
    tpl = ('<div class="card tool"><h2>源文本（可编辑）</h2>'
           '<p style="font-size:12px;color:var(--muted);margin-bottom:var(--sp-sm)">'
           '引擎就在这段文字上跑。改完点「只跑引擎可执行项」重测；也可以在下面手动加'
           '「你」「？」「类比」，看趣味分能涨多少——这比读结论直观。</p>'
           '<textarea id="src" spellcheck="false" style="width:100%;min-height:190px;'
           'padding:12px 14px;font-size:13.5px;line-height:1.85;font-family:inherit;'
           'border:1px solid var(--border-2);border-radius:var(--r-sm);'
           'background:var(--surface);color:var(--fg);resize:vertical;outline:none">'
           '@@SRC@@</textarea>'
           '<div class="btnbar"><button class="btn" id="btn-reset">还原原文</button>'
           '<button class="btn" id="btn-analyze">重新测量</button></div></div>')
    return tpl.replace('@@SRC@@', esc(spec.get('source', '')))


def block_rewrite(spec):
    rs = spec.get('rewrite') or []
    if not rs:
        return ''
    out = []
    for r in rs:
        reasons = ''.join('<li>%s</li>' % x for x in (r.get('reasons') or []))
        out.append(
            '<div class="rw">'
            '<div class="rw-head"><b>%s</b><span class="rw-tags">%s</span></div>'
            '<div class="rw-body">%s</div>'
            '%s</div>'
            % (esc(r.get('head', '')), esc(r.get('tags', '')),
               r.get('body', ''),
               '<ul class="reasons">%s</ul>' % reasons if reasons else ''))
    note = ('<p class="lede">%s</p>' % spec['rewrite_note']) if spec.get('rewrite_note') else ''
    return ('<div class="card"><h2><span class="no">00</span>参考新版</h2>'
            '%s%s</div>' % (note, ''.join(out)))


def block_advice(spec):
    ad = spec.get('advice') or []
    if not ad:
        return ''
    items = ''.join('<li style="margin-bottom:12px"><b>%s</b> %s</li>'
                    % (esc(a.get('h', '')), a.get('body', '')) for a in ad)
    return ('<div class="card"><h2><span class="no">00</span>学习建议</h2>'
            '<ol style="padding-left:20px;font-size:14px">%s</ol></div>' % items)


def block_facts(spec):
    fs = spec.get('facts') or []
    if not fs:
        return ''
    rows = ''.join(
        '<tr><td>%s</td><td class="%s">%s</td><td>%s</td></tr>'
        % (esc(f.get('claim', '')), KIND.get(f.get('kind', ''), ''),
           esc(f.get('verdict', '')), f.get('basis', ''))
        for f in fs)
    return ('<div class="card"><h2><span class="no">00</span>事实/数据核对</h2>'
            '<table><thead><tr><th>原文说法</th><th>判定</th><th>依据</th></tr>'
            '</thead><tbody>%s</tbody></table></div>' % rows)


def render(spec):
    css = read('style.css')
    engine = read('engine.js')
    runtime = read('runtime.js')

    # 引擎里的 ORIG_PARAS 换成这份文本；variant 数据也塞进去
    paras = [p for p in re.split(r'\n+', spec.get('source', '')) if p.strip()]
    engine = re.sub(r'const ORIG_PARAS = \[.*?\];\n',
                    'const ORIG_PARAS = %s;\n' % jdump(paras),
                    engine, count=1, flags=re.S)

    # 把内容规格单独做成一个 <script>，供 runtime 读取
    data = {
        'title': spec.get('title', '中文表达诊断'),
        'subtitle': spec.get('subtitle', ''),
        'mode': spec.get('mode', 'rig'),
        'variants': spec.get('variants') or [],
        'annots': spec.get('annots') or [],
        'controls_on': spec.get('controls_on') or [],
    }
    page = _load_page(spec)
    page = page.replace('/*__CSS__*/', css)
    page = page.replace('/*__DATA__*/', 'window.SPEC = %s;' % jdump(data))
    page = page.replace('/*__ENGINE__*/', engine)
    page = page.replace('/*__RUNTIME__*/', runtime)
    return page


def _load_page(spec):
    tpl = read('page.html')
    blocks = [
        block_verdict(spec),
        block_variants(spec),
        block_summary(spec),
        block_mechanisms(spec),
        block_annots(spec),
        block_controls(spec),
        block_source(spec),
        block_rewrite(spec),
        block_advice(spec),
        block_facts(spec),
    ]
    # 节号由实际存在的块顺序决定，插块不产生断号
    n = 0
    numbered = []
    for b in blocks:
        if not b:
            continue
        new, hits = re.subn(r'(<span class="no">)([^<]*)(</span>)',
                            lambda m: m.group(1) + '%02d' % n + m.group(3), b, count=1)
        if hits:
            n += 1
        numbered.append(new)
    body = ''.join(numbered)
    title = esc(spec.get('title', '中文表达诊断'))
    sub = esc(spec.get('subtitle', ''))
    mode = spec.get('mode', 'rig')
    mode_cn = '严谨化 rig' if mode == 'rig' else '科普化 pop'
    chars = len(re.sub(r'\s', '', spec.get('source', '')))
    chips = ['<span class="chip primary">模式：%s</span>' % mode_cn,
             '<span class="chip">原文 %s 字</span>' % format(chars, ',')]
    if spec.get('variants'):
        chips.append('<span class="chip">%d 份样本</span>'
                     % (len(spec['variants']) + 1))
    chips.append('<span class="chip">引擎实测 · 零依赖</span>')

    return tpl.replace('__TITLE__', title).replace('__SUBTITLE__', sub) \
              .replace('__CRUMBS__', esc(spec.get('crumbs', '中文表達雙鏡片'))) \
              .replace('__CHIPS__', ''.join(chips)).replace('__BODY__', body) \
              .replace('__FOOTER__', esc(spec.get('footer',
                      '由 zh-sci-lens 生成')))


def main(argv):
    if len(argv) < 2:
        sys.stderr.write(__doc__)
        return 2
    with open(argv[1], encoding='utf-8') as f:
        spec = json.load(f)
    html = render(spec)
    if '-o' in argv:
        out = argv[argv.index('-o') + 1]
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(html)
        sys.stdout.write('%s  (%d bytes)\n' % (out, len(html)))
    else:
        sys.stdout.write(html)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
