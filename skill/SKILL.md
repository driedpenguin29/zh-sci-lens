---
name: zh-sci-lens
description: >-
  中文学术表达双镜片：把严谨但难懂的学术/自然科技术语文本「科普化」(pop)，
  或把通俗但失真的科普/营销文「严谨化」(rig)，并输出一份带原文注解、
  可核验定量断言、14 个润色控件与学习建议的 dashboard。
  Use when the user says 科普化、讲得懂一点、太专业看不懂、严谨化、
  这段科普不严谨、帮我改得像人写的同时更严谨、中文学术表达诊断、
  或给出一段中文材料要求「读懂它 / 指出它哪里错」。
  不用于：纯翻译、纯语法校对、英文学术写作。
---

# zh-sci-lens：中文学术表达双镜片

## 它解决什么

中文读者在学术材料上有两个相反的失效点，本 skill 一次处理一个方向：

| 模式 | 输入特征 | 目标 | 判据（实测阈值） |
|---|---|---|---|
| **pop 科普化** | 平均句长 > 45 字、句长变异 < 0.20、术语密度 > 40/千字、连接词 < 5/千字 | 保留术语与条件，把推论关系补出来，用短句换气 | 句长变异升到 0.25–0.45；连接词 ≥ 5/千字 |
| **rig 严谨化** | 情绪词 > 3/千字、绝对化 > 2/千字、破折号 > 1.5/千字、有可核验定量断言 | 保留可读性，把无限定断言改成有条件断言，逐条核对数字 | 破折号 0；绝对化降；定量断言每条有来源或改写 |

**两个模式共用一套输出骨架**，rig 模式额外多一块「事实/数据核对」。

## 三种交付物，按用户要的选

| 交付物 | 什么时候用 | 怎么出 |
|---|---|---|
| **独立单文件 `standalone.html`**（默认） | 用户要一个「能一直用」的工具，或环境里没有 DSH 插件（WorkBuddy、Codex、纯浏览器） | 直接给 `templates/standalone.html`。零依赖、零网络，引擎内联。见下节「独立版怎么用」 |
| **批注本 `report.html`** | 用户只要这一篇的报告，不需要输入框 | 复制 `templates/report.html`，换 `SRC` / `ORIG` / `DATA` 三个载荷。契约见 `references/report-format.md` |
| **仪表盘 dashboard** | 用户要看指标对比、多点几组控件试效果、或要一份可交互的诊断台 | `python3 core/render.py spec.json -o out.html` |

### 独立版怎么用（`templates/standalone.html`）

一个文件，双击就开，不装任何东西。它自己会算指标（引擎内联），但**不联网、不调模型**——
报告由你（agent）按 `references/report-format.md` 的契约写出来，再交回页面渲染。两条路：

1. **把报告烤进文件**（推荐，用户拿到就是成品）：复制 `standalone.html`，在最后一个 `<script>` 之前插一行
   `<script>window.REPORT = {…}</script>`，存成 `报告-<标题>.html`。页面读到 `window.REPORT` 会直接进报告屏。
2. **让页面自己收**：用户打开 `standalone.html` → 贴文本 → 选改法 → 页面给出「复制给 agent 的完整指令」，
   他把指令发给你；你按同样的契约回一个 JSON，他粘回页面右侧，报告当场排出来。

两条路的报告契约完全一样，也都和插件版一样。**改提示词时必须三处同步**：
`templates/standalone.html` 里的 `buildPrompt()`、插件 `lib/host/prompt.js`、
以及 `references/report-format.md` 的字段表。

批注本的流程是**在输入这一步就选定改法**：封面摆出原文 + 两个按钮，点哪个就只出那一份稿。
不要先渲染两份让读者切换——实测读者会以为是同一份稿子的两个视图，而不是两次独立的改写。

两种交付物的共同底线：**正文的每一句判断都由模型写**，引擎只负责测量与验收。
`report.html` 顶栏那句「指标由引擎实测 · 判断与改写由模型撰写」不是在免责，是在说明分工。

**可读性与趣味性是硬指标，不是形容词**（用户指定重点）：
`fun_score` / `read_score` 各 0–100，由引擎测出。验收看**增量**（`diff_report` + `upgrade_ok`），
不看绝对分。配方见 `core/readability-fun.md`。

**实测：正则删除改不出趣味性。** `cf,unv` 在全文上让趣味 26→26、可读 52→52。
趣味性的四个维度（悬念句 / 提问 / 具体锚点 / 对话感）**必须由模型加法产生**，
引擎的职责是测出来并判达标。

## 工作流（6 步，不可跳步）

```
0. 读入        → 存到 tmp/input.txt（纯文本，去格式）
1. 测量        → python3 core/zh_sci_lens.py analyze tmp/input.txt --mode auto --json
2. 定位        → 逐段/逐句列出：哪句太长 / 哪个词不严谨 / 哪个数字可核验
3. 查证        → 只对「步骤 2 挑出来的定量断言与术语」搜网；不泛搜
4. 改写        → 用 core/controls.md 的控件逐条施加，每步可撤销
5. 写 spec     → 把 0–4 步的结果填进 spec.json（契约见 references/dashboard-spec.md）
6. 出 dashboard → python3 core/render.py spec.json -o out.html
```

**步骤 5 的全部内容都来自前 5 步**——不要在 spec 里写前几步没测出来的数字。
`render.py` 只负责排版，不替你判断；但页面上呈现的每个指标都是浏览器端在
**你给的原文**上重新算的，所以 spec 里写错会被自己的页面拆穿。

**步骤 2 是全部价值所在。** 不要读完就整篇重写——实测（`简报思路(3).docx`）：

- 白洞段 tell 分 38.3，把「更绝望的是」和破折号改掉后 → **0.0**。一处修正，全文干净。
- 同一篇的「伪学术」段 tell 分 **0.0**，但它句长变异 0.68 是因为拆出了单字「1.」。
  → 说明「AI 味评分」测不出「难懂」和「不严谨」，必须用本 skill 自己的判据。

## 调用

```bash
# 测量（决定该走哪个模式）
python3 core/zh_sci_lens.py analyze tmp/input.txt --mode auto --json

# 强制某个模式
python3 core/zh_sci_lens.py analyze tmp/input.txt --mode pop --json

# 施加确定性控件（不需要模型的部分）
python3 core/zh_sci_lens.py apply tmp/input.txt --controls cf,ai,num,fil,hed,unv --out tmp/pass1.md

# 出 dashboard（spec 由模型填，render 只排版）
python3 core/render.py spec.json -o dashboard.html

# 自检：例子一→pop、例子二→rig、闸门能拒稿
python3 core/zh_sci_lens.py selftest
```

`--json` 输出的 `per_para` 数组就是步骤 2 的原料：每段带 `chars / sents / cv / max_len / ai / dash / defs / sensational / absolute / quant`。

**零依赖**：只用 `re/math/json/argparse/sys`。没有 `python3` 的宿主，把整个文件内联进 heredoc 即可（见 host-adapters.md）。

`render.py` 同样零依赖（只用 `json/re/os/sys`），读 `templates/` 下的四个文件拼装产物。

## 输出骨架（两个模式都必须给全，rig 多一块）

生成到 dashboard 的**顺序与节号由 render.py 自动编排**，缺块不留空号：

1. **一句话结论** — 用实测数字开头，不用形容词开头
2. *(有 variant 时)* **并列记分** — 多份改写放同一把尺子上量，末列判「谁做到了」
3. **内容总结** — 这段到底说了什么（3–5 条，最后一条指向写作意图）
4. **为什么会这样** — 机制解释，每条带一行判词
5. **原文注解** — 句级/段级，`<mark class="problem">` 标具体片段 + 分条列原因
6. **润色控件** — 14 个开关，区分「引擎可执行」与「需模型完成」
7. *(工具区)* **源文本（可编辑）** — 读者改字后重测，不占报告节号
8. **参考新版** — 改写稿 + 逐处说明「为什么这样改更易懂/更严谨」
9. **学习建议** — 以「中文表达为何难」为轴，长分条（名词化、长定语、无主句、四字格）
10. *(rig)* **事实/数据核对** — 说法 vs 文献结论 + 来源链接

*(可选补充)* 口头报告讲稿版（3–5 分钟口语化）；书面报告可交付版（可直接提交）。

## 硬规则

- **不许改术语**：术语只能「先解释再使用」，不能替换成日常词。替换即失真。
- **类比必须带失效边界**：给出类比的同时给一句「它在哪里不成立」，否则不给。
- **定量断言必须可追溯**：`100亿年` 这类数字在改写中不得静默变化；要么保留原值并标注「待核」，要么给出文献来源。
- **不改事实**：模式 B 只改表达，事实错误单独进「事实核对」块，不在正文里悄悄改掉。
- **每处修改可撤销**：控件逐条施加，dashboard 上每个控件带独立开关。
- **只输出中文**（引用外文文献时可保留原文标题）。

## 参考文件

- `core/controls.md` — 14 个润色控件：操作定义 + 可测指标 + 失败案例
- `core/readability-fun.md` — 可读性/趣味性的可测项、加法配方、5 轮自优化的失败记录
- `references/report-format.md` — **批注本 `report.html` 的载荷契约 + 排版规则 + 生成顺序**（默认交付物，出页面前必读）
- `references/dashboard-spec.md` — **spec.json 全字段契约 + 两条验证命令**（出页面前必读）
- `references/gates.md` — 全部阈值与实测来源
- `references/ui-templates.md` — 三套渲染规格；本机无渲染器时用 `render.py`
- `references/host-adapters.md` — 各 agent 的安装与调用方式
- `templates/report.html` — 批注本实现（换载荷即可复用，不要重写 CSS/JS）
- `examples/rig-whito.json` / `examples/pop-flagellar.json` — 回归夹具（改模板后两篇都要能重生且自检全绿）
