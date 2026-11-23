# Dashboard 三套规格

同一份数据，三种渲法。**先选宿主，再选规格**；不要假设宿主有渲染器。

> **默认走规格 B（`render.py`）。** 它零依赖、离线可用、在浏览器里实算指标，
> 是本 skill 交付 dashboard 的标准路径。规格 A 与 C 只在宿主确有对应渲染器时使用。
> 字段契约见 `dashboard-spec.md`。

---

## B-0. 自包含 HTML（`core/render.py`，默认）

```bash
python3 core/render.py spec.json -o dashboard.html
```

产物约 50 KB，单文件、无外链、无 CDN，双击即开。
浏览器端会在 `spec.source` 上重跑引擎，所以记分板 / 闸门 / 控件效果都是实算值。

已验证覆盖两种形态：
- `examples/rig-whito.json` — 10 段级注解、3 份并列记分、6 条事实核对
- `examples/pop-flagellar.json` — 6 句级注解（`label` 自定义）、单份记分

---

## A. DSH（`dsh-fuse-english` 栅栏）

适用：DeepSeek Harness。页面级规格，有 `context` 四问、单主按钮约束。

````
```dsh-fuse-english
{"type":"dashboard","title":"中文表达诊断","theme":"default",
 "context":{"product":"web page","audience":"中文使用者","task":"诊断并改写一段学术/科普文本"},
 "actions":[{"action":"apply","label":"应用全部控件","tone":"primary"}],
 "components":[
  {"type":"header","title":"诊断","text":"<原文字数> · <段落数> · <模式>"},
  {"type":"section","title":"原文注解","components":[
    {"type":"text","text":"……<span style=\"font-weight:600;font-style:italic;color:#9CA3AF\">问题句</span>……"},
    {"type":"list","items":["为什么不易懂：……"]}
  ]},
  {"type":"stat","label":"句长变异","value":"0.13","note":"目标 ≥0.20"},
  {"type":"section","title":"整体点评","components":[{"type":"text","text":"用实测数字开头"}]},
  {"type":"section","title":"内容总结","components":[{"type":"list","items":["……"]}]},
  {"type":"section","title":"参考新版","components":[
    {"type":"text","text":"新版正文"},
    {"type":"list","items":["为什么更易懂：……"]}
  ]},
  {"type":"section","title":"学习建议","components":[{"type":"list","items":["……"]}]}
 ]}
```
````

规则：整页**只能有一个 `style:"primary"` 的按钮**；所有 `input/select/checkbox/button`
必须带 `action`，否则渲染成 disabled。`rig` 模式额外插入一块「事实/数据核对」的
`table`，列为：说法 / 文献结论 / 来源链接。

---

## B. Antigravity（HTML artifact）

适用：`~/.gemini/antigravity`，用 `<agent-embed src="file:///<artifact_path>/widget.html">`。

硬约束（读自其 `generative_ui/SKILL.md`）：

- 只允许 `https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js` 一个 CDN，其余被 CSP 拦
- 颜色只能用宿主变量：`--background --card --foreground --muted-foreground --border --primary`
- **禁止 `:root` 本地 fallback**（写了也会被拦，且报错更难查）
- 最小字号 12px

```html
<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body{background:var(--background);color:var(--foreground);font-size:14px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px}
    .muted{color:var(--muted-foreground)}
    .mark{font-weight:600;font-style:italic;color:var(--muted-foreground)}
    .accent{color:var(--primary)}
  </style>
</head>
<body class="p-4 space-y-4">
  <section class="card">
    <h1 class="text-lg font-medium">中文表达诊断</h1>
    <p class="muted text-xs mt-1">原文字数 · 段落数 · 模式</p>
  </section>
  <section class="card"><h2 class="text-sm font-medium">原文注解</h2>
    <p>……<span class="mark">问题句</span>……</p>
    <ul class="text-xs muted mt-2 space-y-1"><li>为什么不易懂：……</li></ul>
  </section>
</body>
</html>
```

---

## C. 通用 Markdown（WorkBuddy / Codex / 任意无渲染器宿主）

不假设有任何 HTML 能力。用标题 + 表格 + 引用块，全部可复制。

```markdown
## 中文表达诊断
> 原文 480 字 · 5 段 · 判定：不严谨（shallow 35 > hard 10）

### 原文注解
> 白洞可以让死去的人复活，但前提是你需要在洞口等待 **《100亿年》**…

1. **100亿年**：这个数字没有出处，且与后文「0.1 秒 = 1000 亿年」的量级关系矛盾。
2. **「更绝望的是」**：以情绪取代论证，读者拿不到可检验的判断。

### 整体点评
情绪词 7.2/千字（阈值 3）…（只用实测数字开头）

### 内容总结
- …

### 参考新版
…

- 为什么更易懂：…

### 学习建议
1. …

### 事实/数据核对（rig 模式）
| 说法 | 文献结论 | 来源 |
|---|---|---|
| … | … | … |
```

---

## 视觉语汇（来自 PolyU Blackboard LEI1101 CLC 页）

三套规格共用同一套语汇，改的是渲染方式不是设计：

- 顶部一行灰色小字元信息（课程码位置）→ 对应「原文字数 · 段落数 · 模式」
- 主标题黑色中等字重，副标题灰色
- 链接/可点项用**一个**强调色（DSH `primary` / `--primary`），不铺满
- 区块之间用细分隔线，不叠多层边框（最多两层容器）
- 标注：`font-weight:600; font-style:italic; color:muted` —— 灰、粗、斜，三者同时出现
