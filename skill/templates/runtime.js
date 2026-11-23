/* ===================== 互动运行区（读 window.SPEC，无硬编码内容）===================== */
(function(){
  const $ = id => document.getElementById(id);
  const SPEC = window.SPEC || {};
  const src = $('src');
  if (!src) return;

  const METRICS = [
    ['fun_score','趣味分',50,'ge'], ['read_score','可读分',60,'ge'],
    ['assert_strength','断言强度',8,'le'], ['conn_per_k','连接词/千字',5,'ge'],
    ['dialogue_per_k','对话感/千字',20,'ge'], ['qmark_per_k','提问/千字',4,'ge'],
    ['hook_per_para','悬念句/段',0.35,'ge'], ['mean_len','平均句长',45,'le']
  ];
  // 小数量级指标必须给小数位，否则 0.68 会被 toFixed(0) 四舍五入成 1
  const DEC2 = ['sd_len', 'hook_per_para', 'assert_strength'];
  const dec = k => (k.indexOf('_per_') >= 0 || DEC2.indexOf(k) >= 0) ? 2 : 0;
  const fmt = (x,n) => (typeof x === 'number' ? x.toFixed(n) : String(x));

  const original = src.value;
  const state = {
    sel: new Set((SPEC.controls_on && SPEC.controls_on.length)
                 ? SPEC.controls_on : SLX.ENGINE_OK),
    base: { text: original, agg: SLX.analyze(original).agg }
  };

  /* ---------- 01 并列记分表（引擎实测，非估计） ---------- */
  function renderVTable(){
    const host = $('vtable');
    if (!host) return;
    const cols = [{ name: '原文', text: original }]
      .concat((SPEC.variants || []).map(v => ({ name: v.name, text: v.text })));
    const analyzed = cols.map(c => SLX.analyze(c.text).agg);
    const ROWS = [
      ['断言强度', 'assert_strength', 8, 'le'],
      ['趣味分', 'fun_score', 50, 'ge'],
      ['可读分', 'read_score', 60, 'ge'],
      ['连接词/千字', 'conn_per_k', 5, 'ge'],
      ['对话感/千字', 'dialogue_per_k', 20, 'ge'],
      ['提问/千字', 'qmark_per_k', 4, 'ge'],
      ['悬念句/段', 'hook_per_para', 0.35, 'ge'],
      ['情绪词/千字', 'sensational_per_k', 3, 'le'],
      ['平均句长', 'mean_len', 45, 'le'],
      ['句长变异', 'sd_len', 0.20, 'ge']
    ];
    let head = '<tr><th>指标</th><th class="num">阈值</th>'
      + cols.map(c => '<th class="num">' + c.name + '</th>').join('')
      + '<th>做到了吗</th></tr>';
    let body = ROWS.map(r => {
      const key = r[1], thr = r[2], dir = r[3];
      const vals = analyzed.map(a => a[key]);
      const pass = vals.map(v => dir === 'ge' ? v >= thr : v <= thr);
      const okNames = cols.filter((c, i) => pass[i]).map(c => c.name);
      const who = okNames.length === 0 ? '<span style="color:var(--faint)">都没有</span>'
        : okNames.length === cols.length ? '<span style="color:var(--good)">都做到</span>'
        : okNames.join('、');
      return '<tr><td>' + r[0] + '</td>'
        + '<td class="num" style="color:var(--muted)">' + (dir === 'ge' ? '≥ ' : '≤ ') + thr + '</td>'
        + vals.map(v => '<td class="num">' + fmt(v, dec(key)) + '</td>').join('')
        + '<td>' + who + '</td></tr>';
    }).join('');
    const colgroup = '<colgroup><col style="width:34%"><col style="width:82px">'
      + cols.map(() => '<col style="width:118px">').join('')
      + '<col></colgroup>';
    host.innerHTML = '<table>' + colgroup + '<thead>' + head
      + '</thead><tbody>' + body + '</tbody></table>';
  }

  /* ---------- 03 原文注解（默认展开，折叠时显示摘要） ---------- */
  const TAG_CN = {hard: '太难懂', shallow: '不严谨', thin: '信息量低'};
  function excerpt(t, n){
    const plain = String(t || '').replace(/<[^>]+>/g, '').trim();
    return plain.length > n ? plain.slice(0, n) + '\u2026' : plain;
  }
  function renderAnnots(){
    const host = $('annots');
    if (!host) return;
    host.innerHTML = (SPEC.annots || []).map(function(a){
      const reasons = (a.reasons || []).map(r => '<li>' + r + '</li>').join('');
      return '<div class="p open" data-i="' + a.i + '">'
        + '<div class="p-head" tabindex="0" role="button" aria-expanded="true">'
        + '<span class="idx">' + (a.label || ('段落 ' + a.i)) + '</span>'
        + '<span class="tag ' + a.tag + '">' + (TAG_CN[a.tag] || a.tag) + '</span>'
        + '<span class="excerpt">' + excerpt(a.text, 34) + '</span>'
        + '<span class="arrow">\u25B6</span></div>'
        + '<div class="p-body">' + a.text
        + (reasons ? '<ul class="reasons">' + reasons + '</ul>' : '')
        + '</div></div>';
    }).join('');
    host.querySelectorAll('.p-head').forEach(function(h){
      function toggle(){
        const p = h.parentNode;
        p.classList.toggle('open');
        h.setAttribute('aria-expanded', p.classList.contains('open'));
      }
      h.addEventListener('click', toggle);
      h.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
    const be = $('btn-ann-expand');
    if (be) be.onclick = function(){
      host.querySelectorAll('.p').forEach(function(p){
        p.classList.add('open');
        p.querySelector('.p-head').setAttribute('aria-expanded', 'true');
      });
    };
    const bc = $('btn-ann-collapse');
    if (bc) bc.onclick = function(){
      host.querySelectorAll('.p').forEach(function(p){
        p.classList.remove('open');
        p.querySelector('.p-head').setAttribute('aria-expanded', 'false');
      });
    };
  }

  /* ---------- 04 控件卡 ---------- */
  function renderControls(){
    const host = $('controls');
    if (!host) return;
    const names = Object.keys(SLX.CONTROLS);
    host.innerHTML = names.map(function(id){
      const c = SLX.CONTROLS[id];
      const engine = !!c[1];
      const gain = c[2] == null ? '' : c[2];
      const on = state.sel.has(id);
      return '<div class="ctl' + (on ? ' on' : '') + '" data-id="' + id + '" tabindex="0" role="switch" aria-checked="' + on + '">'
        + '<div class="ch"><span class="nm">' + c[0] + '</span><span class="id">' + id + '</span></div>'
        + '<div class="ds">' + (c[3] || '') + '</div>'
        + '<div class="ft">'
        + '<span class="need ' + (engine ? 'engine' : 'model') + '">' + (engine ? '引擎' : '需模型') + '</span>'
        + '<span class="bar"><i style="width:' + (typeof gain === 'number' ? Math.min(100, gain) : 0) + '%"></i></span>'
        + '<span class="gain">' + (typeof gain === 'number' ? '+' + gain : '') + '</span>'
        + '</div></div>';
    }).join('');
    host.querySelectorAll('.ctl').forEach(function(el){
      function toggle(){
        const id = el.dataset.id;
        if (state.sel.has(id)) state.sel.delete(id); else state.sel.add(id);
        el.classList.toggle('on', state.sel.has(id));
        el.setAttribute('aria-checked', state.sel.has(id));
      }
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  /* ---------- 记分板 + 闸门 ---------- */
  function render(){
    const a = SLX.analyze(src.value);
    const b = state.base.agg;
    const sb = $('scorebar');
    if (!sb) return;
    sb.innerHTML = '';
    METRICS.forEach(function(m){
      const k = m[0], label = m[1], thr = m[2], dir = m[3];
      const v = a.agg[k], bv = b[k];
      if (typeof v !== 'number') return;
      const pass = dir === 'ge' ? v >= thr : v <= thr;
      const delta = v - bv;
      const cls = Math.abs(delta) < 0.005 ? '' : (delta > 0 ? 'up' : 'down');
      const sign = delta > 0 ? '+' : '';
      const n = dec(k);
      sb.insertAdjacentHTML('beforeend',
        '<div class="sb ' + (pass ? 'pass' : 'fail') + '">'
        + '<div class="k">' + label + '</div>'
        + '<div class="v">' + fmt(v, n) + '</div>'
        + '<div class="d ' + cls + '">' + sign + fmt(delta, n)
        + '<span class="thr">\u00b7 \u9608 ' + thr + '</span></div></div>');
    });
  }

  function renderGates(){
    const g = SLX.check_gates(src.value);
    const a = SLX.analyze(src.value);
    const host = $('gates');
    if (!host) return;
    const passTxt = g.pass ? '<b class="ok">全部通过</b>'
      : g.fail.map(f => '<b class="no">' + f[1] + '</b>').join(' · ');
    host.innerHTML = '模式 <b>' + a.mode + '</b>'
      + ' · hard ' + a.score_hard + ' / shallow ' + a.score_shallow
      + ' · 闸门：' + passTxt;
  }

  function refresh(){
    render();
    renderGates();
  }

  /* ---------- 按钮 ---------- */
  function bind(){
    const be = $('btn-engine');
    if (be) be.onclick = function(){
      state.sel = new Set(SLX.ENGINE_OK);
      renderControls();
      const out = SLX.apply_controls(src.value, Array.from(state.sel));
      $('outbox').textContent = out;
      refresh();
    };
    const ba = $('btn-all');
    if (ba) ba.onclick = function(){
      state.sel = new Set(Object.keys(SLX.CONTROLS));
      renderControls();
      const engineNames = Array.from(state.sel).filter(n => SLX.ENGINE_OK.indexOf(n) >= 0);
      $('modelnote').innerHTML = '<div class="task"><b>需模型的项（引擎做不到，要由你或模型改写）：</b><br>'
        + Array.from(state.sel).filter(n => SLX.ENGINE_OK.indexOf(n) < 0)
            .map(n => '<code>' + n + '</code>' + SLX.CONTROLS[n][0]).join('　')
        + '</div>';
    };
    const bn = $('btn-none');
    if (bn) bn.onclick = function(){
      state.sel = new Set();
      renderControls();
      $('outbox').textContent = '已清空。';
      $('modelnote').innerHTML = '';
    };
    const bc = $('btn-copy');
    if (bc) bc.onclick = function(){
      const list = Array.from(state.sel).filter(n => SLX.ENGINE_OK.indexOf(n) < 0)
        .map(n => '- ' + n + ' ' + SLX.CONTROLS[n][0] + '：' + (SLX.CONTROLS[n][3] || ''));
      const txt = list.length ? '需模型执行的控件：\n' + list.join('\n')
        : '当前选择全部可由引擎执行，无需模型。';
      navigator.clipboard && navigator.clipboard.writeText(txt);
      $('modelnote').innerHTML = '<div class="task"><b>已复制任务清单到剪贴板。</b><br><small>'
        + txt.replace(/\n/g, '<br>') + '</small></div>';
    };
    const br = $('btn-reset');
    if (br) br.onclick = function(){ src.value = original; refresh(); };
    const ban = $('btn-analyze');
    if (ban) ban.onclick = refresh;
    src.oninput = refresh;
  }

  renderVTable();
  renderAnnots();
  renderControls();
  bind();
  refresh();
})();
