#!/usr/bin/env bash
# zh-sci-lens 回归自检：引擎 + 两篇夹具的渲染产物
# 用法: bash verify.sh
set -u
cd "$(dirname "$0")" || exit 1
fail=0

say() { printf '%s\n' "$*"; }
ok()  { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
no()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=$((fail+1)); }

say "== 1. Python 引擎 selftest =="
if python3 core/zh_sci_lens.py selftest 2>&1 | grep -q 'SELFTEST PASS'; then
  ok "SELFTEST PASS"
else
  no "selftest"
fi

say "== 2. 模板语法 =="
for f in templates/engine.js templates/runtime.js; do
  if node --check "$f" 2>/dev/null; then ok "$f"; else no "$f 语法错误"; fi
done

say "== 3. 两篇夹具渲染 =="
TMP=$(mktemp -d)
for spec in examples/rig-whito.json examples/pop-flagellar.json; do
  name=$(basename "$spec" .json)
  out="$TMP/$name.html"
  if ! python3 core/render.py "$spec" -o "$out" >/dev/null 2>&1; then
    no "$name 渲染失败"; continue
  fi
  left=$(node -e "
    const h=require('fs').readFileSync('$out','utf8');
    process.stdout.write(String((h.match(/__[A-Z]+__/g)||[]).length));
  " 2>/dev/null || echo "?")
  if [ "$left" = "0" ]; then ok "$name 无残留占位符"; else no "$name 残留占位符 $left 个"; fi

  # 结构断言：这些元素必须出现在产物里
  for pat in 'id="annots"' 'id="scorebar"' 'id="vtable"' 'id="gates"' 'id="src"' 'class="sumlist"'; do
    if grep -q "$pat" "$out"; then :; else no "$name 缺 $pat"; fi
  done
  ok "$name 结构完整"

  # rewrite 段落必须真的带 .rw-body（P0 回归）
  rw=$(grep -o 'class="rw-body"' "$out" 2>/dev/null | wc -l | tr -d ' ')
  spec_rw=$(python3 -c "
import json;print(len(json.load(open('$spec')).get('rewrite') or []))")
  if [ "$rw" -ge "$spec_rw" ]; then ok "$name rewrite 正文 $rw 段"; else no "$name rewrite 正文 $rw < $spec_rw"; fi

  # 节号必须连续（00,01,02,...），插块不留空号
  nums=$(node -e "
    const h=require('fs').readFileSync('$out','utf8');
    const ns=[...h.matchAll(/<span class=\"no\">(\d+)<\/span>/g)].map(m=>+m[1]);
    const bad=ns.some((v,i)=>v!==i);
    process.stdout.write(bad?'BAD':'OK');")
  if [ "$nums" = "OK" ]; then ok "$name 节号连续"; else no "$name 节号有断号"; fi

  # mark.problem 必须是内联标注，不是零
  mk=$(python3 -c "
import json
d=json.load(open('$spec'))
print(sum(str(a.get('text','')).count('<mark class=\"problem\"') for a in d.get('annots') or []))")
  if [ "$mk" -gt 0 ]; then ok "$name 内联标注 $mk 处"; else no "$name 无内联标注"; fi
done
rm -f "$TMP"/*.html
rmdir "$TMP" 2>/dev/null

say "== 4. 三宿主一致性 =="
for d in "$HOME/.workbuddy/skills/zh-sci-lens" "$HOME/.codex/skills/zh-sci-lens"; do
  if [ -d "$d" ]; then
    # 比内容而非文件数：文件数相同但内容漂移是最容易漏的
    a=$(find . -type f -not -path './.git/*' -exec shasum {} \; | sed 's|  \./|  |' | sort | shasum | cut -d' ' -f1)
    b=$(cd "$d" && find . -type f -not -path './.git/*' -exec shasum {} \; | sed 's|  \./|  |' | sort | shasum | cut -d' ' -f1)
    if [ "$a" = "$b" ]; then ok "$(basename $(dirname $d)) 内容一致"; else no "$(basename $(dirname $d)) 内容漂移，需 rsync"; fi
  else
    say "  (跳过 $(basename $(dirname $d))：未安装)"
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32mALL GREEN\033[0m\n'
else
  printf '\033[31m%d FAILED\033[0m\n' "$fail"
fi
exit "$fail"
