# dsh-zh-sci-lens · 双镜批注本

A DSH sidebar module that turns one piece of Chinese text into **one annotated edition**.

Paste the text, pick a direction, read the report, export it:

```
input (paste + choose)  →  processing  →  report (HTML / Markdown)
```

Two directions, and only one is produced per run — running both would be two model calls for a
result you rarely need twice:

| | 严谨化 Tighten | 通俗化 Plain |
|---|---|---|
| for | writing that sounds confident but over-claims | writing that is accurate but unreadable |
| does | pushes each claim back to what its evidence supports, keeps the knowledge | removes repetition, pulls the mechanism forward, drops the emotional escalation |
| never | deletes a fact to sound safe | adds an explanation to sound friendly |

## What the report contains

| Section | What it is |
|---|---|
| 一句话结论 | two paragraphs: what is actually wrong, and what to do about it |
| 原文批注 | the source split into paragraphs; problem fragments are grey-bold-italic with a superscript number, and each number has a margin note giving the reason |
| 改写版 | a full rewrite, paragraph by paragraph, with a margin note saying what changed and why |
| 内容总结 | what the text actually says, and what it only appears to say |
| 事实与数据核对 | claim vs verdict vs basis; only for claims that can be checked |
| 中文表达 | the Chinese-specific habits behind the problem, each with an action you can take now |

Sections that the text does not earn are omitted — a text with no checkable quantities gets no fact
table, and the numbering closes up.

## How it is built

- `index.js` — host entry; injects `webServer`, `tools`, `llm`, `agentDefaultModel`.
- `lib/host/routes.js` — `/health`, `/jobs`, `/job?id=`, `/generate`. `POST /generate` starts a job
  and returns its id immediately, so the panel can show progress instead of hanging.
- `lib/host/llm.js` — streams one completion and parses JSON from it. The stream reports its own
  finish reason, so "the model ran out of budget while thinking" is told apart from "the model
  returned nothing" — the first one retries with a bigger budget.
- `lib/host/polish.js` — a second pass that only runs when the report still contains jargon
  (后置定语 / 机制前置 / 量产级 …). It sends back just those sentences and asks for them in plain
  words; the report is never regenerated from scratch, and a failure here cannot fail the report.
- `lib/host/prompt.js` — the system prompt and the per-request prompt; the report schema lives here.
- `lib/host/jobs.js` — job files under `~/.dsh/zh-sci-lens/jobs/<id>.json`.
- `src/client.ui.js` → `client.js` (built) — the React panel: three screens, the inlined metrics
  engine, and the two exporters. `node build.mjs` regenerates `client.js`; `node build.mjs --check`
  fails when it drifts from the engine source.

The metrics engine (`templates/engine.js` in the `zh-sci-lens` skill) is inlined at build time, so
scores update while you type and nothing is uploaded. The engine only *measures*; every judgement
and every rewrite in the report is written by the model.

## Notes

- Report content is model-written, so a run takes roughly 20–90 seconds depending on length.
  The first attempt gets a 16k token budget; if it comes back empty (a reasoning model spending
  the budget on thinking), it retries once at 32k with a "write the JSON first" nudge.
- `summary` is required. If a run returns without it, one small follow-up call fills just that
  section rather than redoing the whole report.
- Every judgement is written for a reader who does not know the field: if dropping the jargon is
  impossible, the judgement is wrong, not the jargon.
- The panel remembers the last report across reloads; 换一篇 clears it.
- Exported HTML is one self-contained file — no network, prints cleanly to PDF.
