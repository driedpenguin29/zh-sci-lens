# 各宿主适配层

**唯一真源**：本目录（`zh-sci-lens/`）。每个宿主的适配层只做三件事：放到位、写入口、选渲染规格。
**不要在任一宿主里改 core**——改完要回写到真源再同步，否则四个 agent 会跑出四种结果。

---

## 1. DeepSeek Harness（DSH）

- 位置：`$DSH_HOME/skills/zh-sci-lens/`（默认 `~/.dsh/skills/`）
- 发现规则（`@deepseek-ai/dsh-skill-filesystem`）：`segments[1] === 'SKILL.md'`，即
  `<skills_root>/<name>/SKILL.md` 才会被识别。单文件 `.md` 放在根也认，但带 `core/` 的不行。
- 调用：直接 `python3 ~/.dsh/skills/zh-sci-lens/core/zh_sci_lens.py analyze tmp.txt`
- 渲染：规格 A（`dsh-fuse-english` 栅栏）
- **注意**：本机全盘搜不到 `dsh-fuse-english` 渲染器实现。若预览不渲染，退到规格 C（Markdown），
  **不要**为了等渲染器而改 SKILL.md。

## 2. WorkBuddy

- 位置：`~/.workbuddy/skills/zh-sci-lens/`（与 DSH 同构，`SKILL.md` 在其下）
- 本机已有 52 个同名 skill，格式一致，直接目录同步即可：
  `rsync -a --delete ~/.dsh/skills/zh-sci-lens/ ~/.workbuddy/skills/zh-sci-lens/`
- 渲染：规格 C。WorkBuddy 根有 `IDENTITY.md / SOUL.md / USER.md`——若宿主把它们拼进系统提示，
  本 skill 的输出语言和称呼会跟随这些文件，不需要额外适配。

## 3. Codex

- 位置：`~/.codex/skills/zh-sci-lens/`
- 入口：`~/.codex/AGENTS.md`（当前 0 字节）。**追加**一段，不要覆盖：

```markdown
## 中文表达双镜片（zh-sci-lens）
处理「科普化 / 严谨化 / 中文学术表达诊断」时，先读
`~/.codex/skills/zh-sci-lens/SKILL.md`，再运行
`python3 ~/.codex/skills/zh-sci-lens/core/zh_sci_lens.py analyze <file> --mode auto --json`。
输出的 dashboard 用 Markdown 规格（SKILL.md 的规格 C），不要输出 HTML。
```

- 无插件机制：Codex 只有 `AGENTS.md` + 本地文件 + shell，**这不是降级**——
  core 是纯 Python，shell 直接能跑，和插件能力等价。

## 4. Antigravity

- 位置：没有普通 skills 目录（只有 `~/.gemini/antigravity/builtin/skills`，那是内置的，不可写第三方）。
  因此把本目录放到用户工作区的 `.agents/skills/zh-sci-lens/`，并在下次会话里以文件路径引用。
- 渲染：规格 B（HTML artifact + `<agent-embed>`）
- 硬约束（违反必被 CSP 拦）：只有 gstatic 的 tailwind 一个 CDN；颜色只用
  `--background/--card/--foreground/--muted-foreground/--border/--primary`；禁止 `:root` 本地 fallback；
  最小字号 12px。

---

## 同步脚本

```bash
SRC=~/.dsh/skills/zh-sci-lens
rsync -a --delete "$SRC/" ~/.workbuddy/skills/zh-sci-lens/
rsync -a --delete "$SRC/" ~/.codex/skills/zh-sci-lens/
for d in ~/.dsh/skills/zh-sci-lens ~/.workbuddy/skills/zh-sci-lens ~/.codex/skills/zh-sci-lens; do
  python3 "$d/core/zh_sci_lens.py" selftest | tail -1
done
```

**同步后必须跑三次 selftest**。任何一处不同，说明 core 被本地改过。

## 无 Python 的宿主

把 `core/zh_sci_lens.py` 整个读进上下文，用宿主自带的 heredoc 执行：

```bash
python3 - <<'PY'
# ...整份 zh_sci_lens.py...
PY
```

若连 Python 都没有，降级到纯模型执行：`references/gates.md` 的公式可以手算，
`core/controls.md` 的 `D` 类控件可以人肉替换，但 `analyze` 的段落表不再可用——
此时必须在 dashboard 上声明「未测量，仅定性判断」，不能假装有数字。
