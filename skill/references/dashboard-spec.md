# Dashboard 生成契约

渲染器不认识你的文本。它只认一份 `spec.json`：**所有内容块由你为当前文本填写，脚本不做任何判断，只负责排版。**

```
python3 core/render.py spec.json -o out.html
```

产物是一个自包含单文件 HTML（约 50 KB），无外链、无 CDN、离线可开。
浏览器里它会在你自己的原文上重跑引擎——记分表、闸门、控件效果都是**实算**的，不是你写死的数字。

---

## 为什么这样设计

旧版本把某一篇样本的诊断结果硬编码进 HTML，换一篇输入就废。现在拆成两半：

| 半边 | 谁做 | 做什么 |
|---|---|---|
| **判断** | 模型 | 读文本、决定模式、挑出哪句有问题、写理由、写改写稿、查证事实 |
| **排版 + 测量** | `render.py` + `engine.js` | 套模板、注入 CSS、在浏览器里重算 20 个指标 |

所以同一份 `render.py` 跑白洞（rig）和鞭毛马达（pop）都能出图，只有 `spec.json` 不同。

---

## spec.json 全字段

除 `title` / `source` 外，**每个块都可缺省**——缺了就不渲染。

```jsonc
{
  // —— 头部 ——
  "title":     "一页纸说清这段文字的问题",     // 必填
  "subtitle":  "一句话副标题",
  "crumbs":    "zh-sci-lens · 双镜片诊断",
  "mode":      "pop | rig",                   // 只影响头部徽章文字
  "source":    "……原文全文……",                // 必填。引擎在它上面跑
  "footer":    "zh-sci-lens · 引擎实测",

  // —— 00 一句话结论 ——
  "verdict_kind": "bad | warn | good",        // 决定左边框颜色
  "verdict": "……可以含 <b>，不要含换行……",

  // —— 01 并列记分（可选；没有就只测原文）——
  "variants": [{"name": "Gemini", "text": "……"}, {"name": "DeepSeek", "text": "……"}],

  // —— 02 内容总结 ——（用户要求的五块面板之一，别省）
  "summary": [
    "作者想讲的是：……",
    "论证链有三段：……→……→……",
    "作者真正想说的是最后一句：……"
  ],

  // —— 03 为什么会这样 ——
  "mechanisms": [{"h": "小标题", "body": "解释，可含 <b>", "quote": "一行判词（可省）"}],

  // —— 03 原文注解（页面的主体，别省）——
  "annots": [{
    "i":     0,                               // 序号；与 label 二选一
    "label": "第 1 句",                        // 可选。缺省渲染成「段落 0」
    "tag":   "hard | shallow | thin",         // 太难懂 / 不严谨 / 信息量低
    "text":  "……<mark class=\"problem\">问题片段</mark>……",   // 允许内联 HTML
    "reasons": ["为什么不易懂：……", "……"]
  }],

  // —— 04 润色控件 ——
  "controls_on": ["unv", "cf", "qst"],        // 默认打开的控件 id

  // —— 05 参考新版 ——
  "rewrite_note": "改写目标（一句话）",
  "rewrite": [{
    "head":    "开篇 · 用提问代替定义",
    "tags":    "qst + dlg",                   // 用了哪些控件
    "body":    "改写正文，可含 <br> 与 <b>",
    "reasons": ["为什么这样写更好：……"]
  }],

  // —— 06 学习建议 ——
  "advice": [{"h": "一句话结论式小标题", "body": "展开，2–4 句"}],

  // —— 07 事实/数据核对（rig 模式建议总有）——
  "facts": [{
    "claim":   "原文说法",
    "verdict": "虚构 | 归因错误 | 伪精确 | 争议 | ……",
    "kind":    "bad | mid | ok",
    "basis":   "依据（有链接就写链接）"
  }]
}
```

---

## 三条写 spec 的硬规则

**1. `annots[].text` 必须用 `<mark class="problem">` 标出具体是哪几个字。**
只标整段等于没标——读者要知道的是「这句里的哪半句」。样式已定：灰色 `#59524E` + 粗体 + 斜体 + 浅米底 + 虚下划线。

**2. `reasons` 每条都要说清「读者会在哪一步卡住」。**
「太抽象」不是理由。写「『电化学梯度』一次都没被解释，读者卡在这里就放弃了」才是。

**3. `rewrite[].reasons` 要指回具体数据，不要只说「更易懂」。**
写「把 72 字一句拆成两个 30 字句，平均句长从 39.1 降到 20.4」比「句子更短了」有意义。

**4. `summary` 要写「作者真正想说什么」，不是复述原文。**
它的用途是让读者在进入诊断之前先确认「我读懂了吗」。所以最后一条要指向写作意图，
例如「前面四分之三都在为最后这句铺路」——这是原文自己没说出来、但读者需要知道的事。

**5. 节号是自动的。** 块缺省就不渲染、不留空号；`源文本` 是交互工具区，不占报告节号。
不要手写「02」「03」。

---

## 两条验证命令

```bash
# 1) spec 合法 + 产物无残留占位符
python3 core/render.py examples/rig-whito.json -o /tmp/a.html
node -e "const h=require('fs').readFileSync('/tmp/a.html','utf8');
         console.log('leftover:', (h.match(/__[A-Z]+__/g)||[]).length)"

# 2) 浏览器里自检（打开后 console）
#    #annots .p            → 应等于 spec.annots.length
#    .rw-body             → 每个 offsetHeight > 0（P0 回归项）
#    #scorebar .sb        → 8
#    #gates               → 「模式 xx · hard N / shallow N · 闸门：…」
```

`examples/` 里两份是回归夹具，不是交付物：
- `rig-whito.json` — 白洞科普，rig 模式，10 段注解 / 3 段改写 / 6 条事实
- `pop-flagellar.json` — 鞭毛马达论文摘要，pop 模式，6 句级注解

改完 `render.py` / `runtime.js` / `style.css`，两份都要能重新渲染且自检全绿。
