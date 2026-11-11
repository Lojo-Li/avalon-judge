/* =====================================================================
 * 界面 ui
 * 提示浮层与各阶段 render() 渲染函数（HTML 模板集中在此）
 * 由 v1 单文件版按功能切分，逻辑逐字未改。加载顺序见 index.html，不可调换。
 * ===================================================================== */
'use strict';
/* ---------- 小提示 ---------- */
function showToast(t) {
  R.toast = t;
  if (R.toastTimer) clearTimeout(R.toastTimer);
  // 浮层是 position:fixed，与文档滚动无关；出现和自动消失都不该把页面弹回顶部
  R.toastTimer = setTimeout(() => { R.toast = ''; render(true); }, 2600);
  render(true);
}
function clearToast() { R.toast = ''; if (R.toastTimer) clearTimeout(R.toastTimer); }

/* ====================== 渲染 ====================== */
function render(keepScroll) {
  // 换阶段 / 换页 / 设备交接默认回到顶部；同页局部重绘可传 true 保持当前滚动位置。
  // 必须在重建 DOM 之前读取 scrollY，否则内容变矮时会被浏览器夹断。
  const keepY = keepScroll === true ? window.scrollY : 0;
  const app = document.getElementById('app');
  let h = '';
  switch (S ? S.screen : 'SETUP') {
    case 'SETUP':      h = renderSetup(); break;
    case 'DEAL':       h = renderDeal(); break;
    case 'EYES':       h = renderEyes(); break;
    case 'TEAM_BUILD': h = renderTeamBuild(); break;
    case 'TEAM_VOTE':  h = renderTeamVote(); break;
    case 'QUEST':      h = renderQuest(); break;
    case 'ASSASSINATE':h = renderAssassinate(); break;
    case 'GAME_OVER':  h = renderGameOver(); break;
  }
  if (R.toast) h += '<div class="toast">' + esc(R.toast) + '</div>';
  if (S && S.screen !== 'SETUP' && S.screen !== 'GAME_OVER') {
    if (R.confirmAbort) {
      // 不放入 .abort 容器：.abort button 会覆盖 .btn 的大按钮样式
      h += '<div class="card" id="abortConfirm" style="margin-top:26px;border-color:var(--bad)">' +
           '<div class="msg">确定放弃本局并回到设置页吗？当前进度将清空，无法恢复。</div>' +
           '<button class="btn bad" onclick="abortGame()">⚠️ 再点一次确认放弃</button>' +
           '<button class="btn ghost" onclick="cancelAbort()">取消</button></div>';
    } else {
      h += '<div class="abort"><button onclick="abortGame()">放弃本局</button></div>';
    }
  }
  if (!STORAGE_OK) {
    // 温和降级提示：只在探测到存储不可写时出现，追加在末尾，不遮挡任何按钮
    h += '<div class="msg info" style="margin-top:18px">⚠️ 当前浏览器禁止本地存储：本局可正常进行，但刷新后进度不会保留。</div>';
  }
  // 供样式层按阶段精确启停动效（任务秘密投票阶段保持绝对静止）
  app.setAttribute?.('data-screen', S ? S.screen : 'SETUP');
  app.innerHTML = h;
  window.scrollTo(0, keepY);
}

/* ---------- 设置页 ---------- */
function renderSetup() {
  const n = U.count;
  const badN = BAD_COUNT[n];
  let h = '<h1 class="title">阿瓦隆</h1><div class="subtitle">单机电子裁判 · 递设备玩法</div>';

  /* ===== 第 1 页：玩家设置（人数 + 姓名） ===== */
  if (U.page === 1) {
    h += '<div class="step-ind">第 1 / 2 步 · 玩家设置</div>';
    /* 主持人模式：开局前就定好「有没有中立裁判」，免得进了睁眼环节现场再商量 */
    h += '<div class="card"><div class="sec-title">本局主持人</div>';
    const modes = [
      ['human', '人工裁判', '现场有主持人照着屏幕念口令、逐步点「下一步」（沿用现在的玩法）'],
      ['voice', '语音裁判', '全场都是玩家时选这个：手机自动播完内置中文口令，名单自动显隐，全程无需操作'],
    ];
    for (const [key, name, desc] of modes) {
      const on = (U.judgeMode || 'human') === key;
      h += '<button class="pick' + (on ? ' on' : '') + '" onclick="setJudgeMode(\'' + key + '\')">' +
           '<span class="mark">' + (on ? '◉' : '○') + '</span>' +
           '<span class="pbody"><span class="pname">' + name + '</span><div class="pdesc">' + desc + '</div></span></button>';
    }
    h += '<div class="hint" style="text-align:left;margin-top:10px">语音裁判只自动托管睁眼环节；之后的组队、发车记票、任务投票仍需一位玩家操作手机。<br>' +
         '口令语音已内置在页面里，微信和外部浏览器都能播；没声音请先调高媒体音量、关闭静音。</div></div>';

    h += '<div class="card"><div class="sec-title">玩家人数（5 ~ 10）</div><div class="count-row">';
    for (let c = 5; c <= 10; c++) {
      h += '<button class="count-pill' + (n === c ? ' on' : '') + '" onclick="setCount(' + c + ')">' + c + '</button>';
    }
    h += '</div>';
    h += '<div class="hint" style="margin-top:10px">阵营配置：好人 ' + (n - badN) + ' 人 / 坏人 ' + badN + ' 人（必含梅林与刺客）</div></div>';

    h += '<div class="card"><div class="sec-title">玩家名字（座位顺序 = 行动顺序）</div>' +
         '<div class="hint" style="text-align:left;margin:0 0 10px">不想取名字可以直接留空，会自动用 1号、2号…</div>';
    for (let i = 0; i < n; i++) {
      h += '<div class="name-row"><span class="seat">' + (i + 1) + '号</span>' +
           '<input maxlength="8" placeholder="留空默认：' + (i + 1) + '号" value="' + esc(U.names[i]) + '" oninput="setName(' + i + ', this.value)"></div>';
    }
    h += '</div>';

    if (U.err) h += '<div class="msg">' + esc(U.err) + '</div>';
    h += '<button class="btn gold" onclick="setupNext()">下一步 · 身份配置 ▸</button>';
    return h;
  }

  /* ===== 第 2 页：身份配置（摘要 + 可选角色） ===== */
  h += '<div class="step-ind">第 2 / 2 步 · 身份配置</div>';
  // 摘要卡：人数 / 阵营 / 默认名处理后的名单，不必退回第 1 页即可确认
  h += '<div class="card gold"><div class="sec-title">本局设置</div>' +
       '<div style="font-size:16px;line-height:1.9">玩家人数：<b style="color:var(--gold)">' + n + ' 人</b><br>' +
       '阵营配置：好人 ' + (n - badN) + ' 人 / 坏人 ' + badN + ' 人<br>' +
       '主持人：' + (U.judgeMode === 'voice' ? '🎙 语音裁判（睁眼环节自动托管）' : '👤 人工裁判') + '</div>' +
       '<div class="divider"></div>' +
       '<div class="sec-title">玩家名单（按座位顺序）</div>' +
       '<div style="font-size:16px;line-height:1.9">' + effectiveNames().map(esc).join('、') + '</div></div>';

  h += '<div class="card"><div class="sec-title">可选角色<span style="white-space:nowrap">（任意组合，从对应阵营名额中占用）</span></div>';
  const opts = [
    ['percival', 'good', '派西维尔', '开局知道梅林与莫甘娜，但分不清谁是真梅林'],
    ['morgana',  'bad',  '莫甘娜',   '坏人，向派西维尔伪装成梅林'],
    ['mordred',  'bad',  '莫德雷德', '坏人，梅林看不到他'],
    ['oberon',   'bad',  '奥伯伦',   '坏人，不参与互认，也不知道同伴'],
  ];
  for (const [key, team, name, desc] of opts) {
    h += '<button class="pick' + (U.roles[key] ? ' on' : '') + '" onclick="toggleRole(\'' + key + '\')">' +
         '<span class="mark">' + (U.roles[key] ? '☑' : '☐') + '</span>' +
         '<span class="pbody"><span class="pname">' + name + '</span><div class="pdesc">' + desc + '</div></span>' +
         '<span class="tag ' + team + '">' + (team === 'good' ? '好人' : '坏人') + '</span></button>';
  }
  h += '</div>';

  if (U.err) h += '<div class="msg">' + esc(U.err) + '</div>';
  h += '<button class="btn gold" onclick="startGame()">🎲 开始游戏</button>';
  h += '<button class="btn ghost" onclick="setupBack()">◂ 上一步</button>';
  h += '<div class="hint">发车投票：全场线下举手，操作者点人数即可（同一任务连否 2 次后，第 3 次自动发车）<br>任务投票：逐个递设备秘密投，坏人可选失败，好人只能成功</div>';
  return h;
}

/* ---------- 通用：任务进度面板（实时显示，所有对局页都可见） ---------- */
function renderProgress() {
  const tbl = QUEST_TABLE[S.numPlayers];
  const succ = S.questResults.filter(x => x === 'success').length;
  const fail = S.questResults.filter(x => x === 'fail').length;
  let cells = '';
  for (let i = 0; i < 5; i++) {
    const r = S.questResults[i];
    const isCur = (i === S.round) && !r;
    let cls = 'qdot';
    if (r === 'success') cls += ' blue';
    else if (r === 'fail') cls += ' red';
    else if (isCur) cls += ' cur';
    // 7~10 人局第 4 任务需 2 张失败牌，完成后不再提示
    const needTwo = (i === 3 && S.numPlayers >= 7);
    let cap;
    if (r === 'success') cap = '成功';
    else if (r === 'fail') cap = '失败';
    else cap = needTwo ? '需2败' : (isCur ? '进行中' : '待进行');
    // 主视觉 = 任务人数；序号只作左上角小角标（主次反转）
    cells += '<div class="qcell"><div class="' + cls + '">' +
      '<span class="qseq">' + (i + 1) + '</span>' +
      '<span class="qnum">' + tbl[i] + '<span class="unit">人</span></span></div>' +
      '<div class="qcap' + (isCur ? ' cur' : '') + '">' + cap + '</div></div>';
  }
  return '<div class="progress">' +
    '<div class="pg-head"><span>任务进度</span>' +
    '<span><b style="color:var(--good)">成功 ' + succ + '</b> · <b style="color:var(--bad)">失败 ' + fail + '</b>（三胜/三败即结束）</span></div>' +
    '<div class="pg-dots">' + cells + '</div></div>';
}
function renderHud() {
  const need = QUEST_TABLE[S.numPlayers][S.round];
  return '<div class="hud">' +
    '<span class="hud-task"><span class="hud-seq">任务 ' + (S.round + 1) + '/5</span>' +
    '<span class="hud-need">需 <b>' + need + '</b> 人</span></span>' +
    '<span>队长 <b>' + esc(S.players[S.leaderIdx].name) + '</b></span>' +
    '<span>组队 <b>' + (S.voteTrack + 1) + '/3</b></span>' +
    '</div>';
}
/* 线下举手记票的一行 */
function countRow(kind, label, val) {
  return '<div class="countbox"><span class="lb ' + kind + '">' + label + '</span>' +
    '<span class="stepper">' +
    '<button onclick="tvSet(\'' + kind + '\',-1)">−</button>' +
    '<span class="num">' + val + '</span>' +
    '<button onclick="tvSet(\'' + kind + '\',1)">+</button>' +
    '</span></div>';
}
function renderQuestDots() {
  let h = '<div class="dots">';
  for (let i = 0; i < 5; i++) {
    const r = S.questResults[i];
    let cls = 'dot';
    if (r === 'success') cls += ' blue';
    else if (r === 'fail') cls += ' red';
    else if (i === S.round) cls += ' cur';
    h += '<div class="' + cls + '">' + (i + 1) + '</div>';
  }
  return h + '</div>';
}
function roleCardHtml(p) {
  const info = ROLES[p.role];
  return '<div class="rolecard"><div class="art">' +
    '<img src="' + info.card + '" alt="" draggable="false" decoding="async"></div>' +
    '<div class="rname">' + info.name + '</div>' +
    '<div class="team-badge ' + info.team + '">' + (info.team === 'good' ? '好人阵营' : '坏人阵营') + '</div>' +
    '<div class="rdesc">' + info.desc + '</div></div>';
}

/* ---------- 递牌 ---------- */
function renderDeal() {
  const i = S.dealIdx, p = S.players[i];
  let h = '<h1 class="title" style="font-size:20px">身份发放</h1>' +
    '<div class="step-ind">第 ' + (i + 1) + ' / ' + S.numPlayers + ' 位</div>';
  if (R.dealStage === 'hidden') {
    h += '<div class="card gold"><div class="bigtext gold">📱</div>' +
      '<div style="text-align:center;font-size:18px;margin-top:6px">请把设备交给<br><b style="color:var(--gold);font-size:22px">' + esc(p.name) + '</b></div>' +
      '<div class="hint">确认周围无人偷看后再点下方按钮</div></div>' +
      '<button class="btn gold" onclick="dealShow()">我是 ' + esc(p.name) + ' · 查看身份</button>';
  } else if (R.dealStage === 'shown') {
    // v3：递牌环节只显示本人身份，不再显示"你知道的人"（队友信息统一放到睁眼环节口头完成）
    h += '<div class="card">' + roleCardHtml(p) +
      '<div class="hint" style="margin-top:14px">本环节只显示你自己的身份，不显示任何其他玩家信息。看完后不要声张。</div></div>' +
      '<button class="btn ghost" onclick="dealHide()">我知道了（隐藏）</button>';
  } else { // handoff
    const next = i < S.numPlayers - 1 ? S.players[i + 1].name : null;
    h += '<div class="card gold"><div class="bigtext gold">🤝</div>' +
      '<div style="text-align:center;font-size:17px">' + (next
        ? '请将设备交给下一位：<br><b style="color:var(--gold);font-size:22px">' + esc(next) + '</b>'
        : '全员身份已发放完毕') + '</div></div>' +
      (next ? '<button class="btn gold" onclick="dealNext()">已交接，下一位</button>'
            : '<button class="btn gold" onclick="dealFinish()">进入睁眼环节</button>');
  }
  return h;
}

/* ---------- 睁眼引导 ---------- */
/* 名单块两种模式共用；语音模式下由托管逻辑自动展开/收起，不再给手动按钮 */
function eyesSecretBox(step) {
  const list = eyesSecretList(step.secret);
  const titles = { evil: '坏人名单（已隐去奥伯伦）', merlin: '梅林看到的坏人（除莫德雷德外）', percival: '派西维尔看到的两人（不标真假）' };
  const voice = S.judgeMode === 'voice' && !R.voice.fallback;
  return '<div class="secret-box"><div class="s-title">🔒 ' + titles[step.secret] + '</div>' +
    '<div class="s-list">' + list.map(esc).join('<br>') + '</div>' +
    '<div class="hint">' + (voice ? '仅限被点名角色睁眼查看，本步结束后自动收起' : '仅限被点名角色查看，看完请立即隐藏') + '</div></div>';
}
function renderEyes() {
  const step = S.eyesSteps[S.eyesStep];
  const total = S.eyesSteps.length;
  const voice = S.judgeMode === 'voice' && !R.voice.fallback;
  let h = '<h1 class="title" style="font-size:20px">睁眼环节</h1>';

  /* 语音裁判 · 准备页：刷新 / 中途退出后再进来一律回这里，不会突然开念 */
  if (voice && R.voice.stage === 'ready') {
    h += '<div class="step-ind">🎙 语音裁判 · 准备</div>' +
      '<div class="card gold"><div class="bigtext gold" style="font-size:22px">全自动语音裁判</div>' +
      '<div class="hint" style="text-align:left;line-height:1.9">' +
        '把手机平放在桌面中央、<b>媒体音量调大</b>，全员闭眼后点下方按钮。<br>' +
        '接下来 ' + total + ' 步口令会用<b>内置中文语音</b>自动念完（不挑浏览器，微信里也能响），名单自动显示与收起，全程无需操作手机。<br>' +
        '第一次使用建议先试听一句。</div></div>';
    if (R.voice.notice) h += '<div class="msg info">' + esc(R.voice.notice) + '</div>';
    h += '<button class="btn gold" onclick="voiceStart()">▶ 开始语音裁判</button>' +
         '<div class="voice-ctrl">' +
           '<button class="btn small" onclick="voicePreview()">🔊 试听一句</button>' +
           '<button class="btn small" onclick="voiceStartSilent()">📜 只用字幕</button></div>' +
         '<button class="btn ghost" onclick="voiceUseHuman()">改用人工裁判</button>';
    return h;
  }

  /* 语音裁判 · 播报中：屏幕同时保留文字与完整口令，语音没响也看得懂 */
  if (voice) {
    const silent = R.voice.silent;
    const replay = silent ? '🔁 重看本句' : '🔁 重播本句';
    h += '<div class="step-ind">' + (silent ? '📜 字幕托管' : '🎙 语音裁判') + ' · 第 ' + (S.eyesStep + 1) + ' / ' + total + ' 步</div>' +
      '<div class="card gold">' +
        (silent
          ? '<div class="bigtext gold" style="font-size:19px;line-height:1.8;letter-spacing:.04em;padding:18px 4px">' + esc(step.say || step.big) + '</div>' +
            '<div class="hint">' + esc(step.big) + ' · 请照做，随后自动进入下一步</div>'
          : '<div class="bigtext gold">' + esc(step.big) + '</div>' +
            '<div class="hint" style="text-align:left;line-height:1.9">' + esc(step.say || step.big) + '</div>') +
      '</div>';
    if (step.secret && R.eyesShown) h += eyesSecretBox(step);
    if (R.voice.stage === 'paused') {
      h += '<div class="msg info">⏸ 已暂停。点「继续」会从本句开头重新' + (silent ? '显示' : '播放') + '。</div>' +
           '<button class="btn good" onclick="voiceResume()">▶ 继续</button>' +
           '<div class="voice-ctrl">' +
           '<button class="btn small" onclick="voiceReplay()">' + replay + '</button>' +
           '<button class="btn small" onclick="voiceSkip()">⏭ 跳过本句</button>' +
           '<button class="btn small" onclick="voiceUseHuman()">👤 改用人工</button></div>';
    } else {
      h += '<div class="voice-ctrl">' +
           '<button class="btn small" onclick="voicePause()">⏸ 暂停</button>' +
           '<button class="btn small" onclick="voiceReplay()">' + replay + '</button>' +
           '<button class="btn small" onclick="voiceSkip()">⏭ 跳过本句</button></div>' +
           '<button class="btn ghost" onclick="voiceUseHuman()">改用人工裁判</button>';
    }
    if (R.voice.notice) h += '<div class="msg info">' + esc(R.voice.notice) + '</div>';
    return h;
  }

  /* 人工裁判（含语音失败后的降级）：完全沿用原有逐步点击流程 */
  if (R.voice.fallback && R.voice.notice) h += '<div class="msg info">' + esc(R.voice.notice) + '</div>';
  if (loadJudgeModePref() === 'voice') {
    h += '<div class="msg info">本局被旧版本切回了人工。点下方按钮一键改回全自动托管，<b>不用放弃本局</b>。<br>' +
      '若还看到「已切回人工模式」的旧提示，说明是微信缓存：点右上角「···」→ 刷新，或用带 <b>v15</b> 的新链接打开。</div>' +
      '<button class="btn gold" onclick="voiceRecover()">▶ 一键改回全自动托管</button>';
  }
  h += '<div class="step-ind">第 ' + (S.eyesStep + 1) + ' / ' + total + ' 步</div>' +
    renderQuestDots() +
    '<div class="card gold"><div class="bigtext gold">' + esc(step.big) + '</div>' +
    (step.note ? '<div class="hint">' + esc(step.note) + '</div>' : '') + '</div>';
  if (step.secret) {
    if (R.eyesShown) {
      h += eyesSecretBox(step) + '<button class="btn bad" onclick="eyesToggle()">🙈 点击隐藏名单</button>';
    } else {
      h += '<button class="btn gold" onclick="eyesToggle()">👁 点击显示名单</button>';
    }
  }
  h += '<button class="btn' + (step.secret && R.eyesShown ? ' ghost' : ' good') + '" onclick="eyesNext()">' +
    (S.eyesStep < total - 1 ? '下一步 ▸' : '全员睁眼 · 开始对局 ▸') + '</button>';
  return h;
}

/* ---------- 组队 ---------- */
function renderTeamBuild() {
  const need = QUEST_TABLE[S.numPlayers][S.round];
  const forced = S.voteTrack >= 2;
  let h = renderProgress() + renderHud() +
    '<div class="card gold"><div class="sec-title">第 ' + (S.round + 1) + ' 个任务 · 第 ' + (S.voteTrack + 1) + ' 次组队' +
    (forced ? '（本次必发车）' : '') + '</div>' +
    '<div style="font-size:17px">队长 <b style="color:var(--gold)">' + esc(S.players[S.leaderIdx].name) + '</b> 请操作设备，选择 <b class="need-big">' + need + '</b> 名队员<span style="white-space:nowrap">（可包含自己）</span></div>' +
    (forced ? '<div class="hint" style="color:var(--gold)">已连续 2 次被否决，本次组队无需投票、自动通过</div>'
            : (S.voteTrack > 0 ? '<div class="hint">本任务已被否决 ' + S.voteTrack + ' 次，第 3 次组队必发车</div>' : '')) +
    '</div>';
  h += '<div class="card">';
  for (let i = 0; i < S.numPlayers; i++) {
    const on = S.team.includes(i);
    h += '<button class="member' + (on ? ' on' : '') + '" onclick="toggleTeam(' + i + ')">' +
      '<span class="mk">' + (on ? '✔' : '') + '</span>' + esc(S.players[i].name) +
      (i === S.leaderIdx ? ' <span style="color:var(--gold);font-size:12px">（队长）</span>' : '') + '</button>';
  }
  h += '<div style="text-align:center;color:var(--text-dim);margin-top:8px">已选 ' + S.team.length + ' / ' + need + ' 人</div></div>';
  if (S.teamMsg) h += '<div class="msg">' + esc(S.teamMsg) + '</div>';
  h += '<button class="btn good" onclick="confirmTeam()">确认组队 · 发起投票</button>';
  return h;
}

/* ---------- 组队投票（线下举手 → 记录票数） ---------- */
function renderTeamVote() {
  const tv = S.tv, tot = S.numPlayers;
  let h = renderProgress() + renderHud();
  const teamLine = '<div class="hint" style="margin-top:8px">本次队伍：' + S.team.map(i => esc(S.players[i].name)).join('、') + '</div>';

  // 必发车
  if (tv.stage === 'forced') {
    h += '<div class="card gold"><div class="bigtext gold">🚀</div>' +
      '<div style="text-align:center;font-size:19px;line-height:1.7">本任务已连续 2 次组队被否决<br><b style="color:var(--gold)">第 3 次组队自动通过，无需投票</b></div>' +
      teamLine + '</div>' +
      '<button class="btn good" onclick="teamVoteContinue()">直接发车 · 开始任务 ▸</button>';
    return h;
  }

  // 记票
  if (tv.stage === 'count') {
    h += '<div class="step-ind">第 ' + (S.voteTrack + 1) + ' 次组队 · 全场举手表决</div>' +
      '<div class="card gold"><div class="sec-title">请全体玩家同时表态<span style="white-space:nowrap">（线下举手，无需逐人操作）</span></div>' +
      '<div style="font-size:17px;line-height:1.8">🙋 赞成的举手 → 裁判点数后填入下方<br>🙅 反对的举手 → 同样填人数<br>' +
      '<span style="color:var(--text-dim);font-size:14px">须严格过半才通过，平票视为否决</span></div>' +
      teamLine + '</div>';
    h += '<div class="card">' + countRow('yes', '👍 赞成', tv.yes) + countRow('no', '👎 反对', tv.no) +
      '<div class="hint" style="margin-top:8px">已计 <b style="color:var(--gold)">' + (tv.yes + tv.no) + '</b> / ' + tot + ' 人' +
      ((tv.yes + tv.no) === tot ? ' · 已统计完，可确认' : '') + '</div>' +
      '<div class="grid2" style="margin-top:10px">' +
      '<button class="btn ghost small" style="margin:0" onclick="tvFill(\'yes\')">全票赞成</button>' +
      '<button class="btn ghost small" style="margin:0" onclick="tvReset()">清零重计</button></div></div>';
    if (tv.msg) h += '<div class="msg">' + esc(tv.msg) + '</div>';
    h += '<button class="btn gold" onclick="tvSubmit()">确认票数 · 看结果 ▸</button>';
    return h;
  }

  // 结果
  const ok = tv.pass;
  h += '<div class="step-ind">投票结果 · ' + tv.yes + ' 赞成 / ' + tv.no + ' 反对（共 ' + tot + ' 人，需严格过半）</div>' +
    '<div class="card"><div class="vote-card">' +
    '<div class="vote-result ' + (ok ? 'yes">✅ 通过发车' : 'no">❌ 否决') + '</div>' +
    '<div class="chips"><span class="chip yes">👍 ' + tv.yes + ' 人赞成</span>' +
    '<span class="chip no">👎 ' + tv.no + ' 人反对</span></div>' +
    '</div></div>';
  if (ok) {
    h += '<button class="btn good" onclick="teamVoteContinue()">队伍通过 · 开始任务 ▸</button>' +
      '<button class="btn ghost small" onclick="tvEdit()">↩ 票数填错了，重新记票</button>';
  } else {
    const nextLeader = S.players[(S.leaderIdx + 1) % S.numPlayers].name;
    const nextIsForced = (S.voteTrack + 1) >= 2;
    h += '<div class="msg">组队被否决，队长顺延至 <b>' + esc(nextLeader) + '</b>。' +
      (nextIsForced ? '下一位队长为第 3 次组队，将<b>自动发车</b>（不再投票）。'
                    : '本任务还可再否决 1 次，第 3 次组队必发车。') + '</div>' +
      '<button class="btn gold" onclick="teamVoteContinue()">继续 · 重新组队 ▸</button>' +
      '<button class="btn ghost small" onclick="tvEdit()">↩ 票数填错了，重新记票</button>';
  }
  return h;
}

/* ---------- 任务（秘密投票：闸门页 → 选牌 → 二次确认） ---------- */
function renderQuest() {
  const qv = S.qv;
  const total = qv.order.length;
  let h = renderProgress() + renderHud();

  if (qv.stage === 'gate') {
    // 闸门页：明确告诉现在轮到几号，避免拿错设备或误触
    const seat = qvVoter();
    const first = qv.idx === 0;
    h += '<div class="step-ind">秘密任务投票 · 第 ' + (qv.idx + 1) + ' / ' + total + ' 位队员</div>' +
      '<div class="card gold"><div class="bigtext gold">📱</div>' +
      '<div style="text-align:center;font-size:17px">' + (first ? '请把设备交给第一位队员' : '上一位已投票，请把设备交给下一位') + '</div>' +
      '<div style="text-align:center;font-size:28px;font-weight:800;color:var(--gold);margin:12px 0 4px">' + (seat + 1) + ' 号 · ' + esc(S.players[seat].name) + '</div>' +
      '<div class="hint">屏幕上不显示任何投票信息 · 请确认是你本人并用手遮挡屏幕</div></div>' +
      '<button class="btn gold" onclick="qvBegin()">我是 ' + (seat + 1) + ' 号 · 开始投票</button>';
  } else if (qv.stage === 'vote') {
    h += '<div class="card gold"><div class="bigtext gold">🗳️</div>' +
      '<div style="text-align:center;font-size:20px;font-weight:700">请选择你要投出的牌</div>' +
      '<div class="hint">选择后还会再确认一次 · 好人阵营只能投成功</div></div>' +
      '<button class="btn good" onclick="qvPick(\'success\')">🔵 成功</button>' +
      '<button class="btn bad" onclick="qvPick(\'fail\')">🔴 失败</button>';
  } else if (qv.stage === 'confirm') {
    // 二次确认：给出明确反馈，防止手滑点错
    const okv = qv.pending === 'success';
    h += '<div class="step-ind">请确认你的选择</div>' +
      '<div class="card"><div class="vote-card">' +
      '<div style="font-size:15px;color:var(--text-dim)">你选择投出</div>' +
      '<div class="vote-result ' + (okv ? 'yes">🔵 成功' : 'no">🔴 失败') + '</div>' +
      '<div class="hint">确认后立即锁定，无法修改</div></div></div>' +
      '<button class="btn gold" onclick="qvConfirm()">✅ 确认提交</button>' +
      '<button class="btn ghost" onclick="qvReselect()">↩ 重选</button>';
  } else if (qv.stage === 'ready') {
    h += '<div class="card gold"><div class="bigtext gold">✋</div>' +
      '<div style="text-align:center;font-size:19px">全部 ' + total + ' 位队员已完成秘密投票<br>请裁判公布结果</div></div>' +
      '<button class="btn gold" onclick="revealQuest()">📣 公布结果</button>';
  } else { // reveal
    const need = (S.round === 3 && S.numPlayers >= 7) ? 2 : 1;
    const ok = qv.outcome === 'success';
    h += '<div class="step-ind">第 ' + (S.round + 1) + ' 个任务结果' + (need === 2 ? '（本任务需 2 张失败牌才算失败）' : '') + '</div>' +
      '<div class="card"><div class="vote-card">' +
      '<div style="font-size:20px;color:var(--text-dim)">共 <b style="color:var(--bad);font-size:30px">' + qv.failCount + '</b> 张失败牌</div>' +
      '<div class="vote-result ' + (ok ? 'good">✅ 任务成功' : 'bad">❌ 任务失败') + '</div>' +
      '<div class="hint">具体谁投了什么，将在最终复盘中揭晓</div></div></div>' +
      '<button class="btn gold" onclick="questContinue()">继续 ▸</button>';
  }
  return h;
}

/* ---------- 刺杀 ---------- */
function renderAssassinate() {
  const ass = S.ass;
  if (ass.stage === 'discuss') {
    return '<h1 class="title" style="font-size:20px">刺杀阶段</h1>' +
      renderQuestDots() +
      '<div class="card gold"><div class="bigtext gold">🗡️</div>' +
      '<div style="text-align:center;font-size:19px">三个任务已成功！<br><b style="color:var(--bad)">坏人阵营请线下讨论</b><br>确定刺杀目标后，把设备交给刺客。</div>' +
      '<div class="hint">讨论时请勿让好人看到屏幕</div></div>' +
      '<button class="btn bad" onclick="assDiscussDone()">刺客就位 ▸</button>';
  }
  if (ass.stage === 'confirm') {
    let h = '<h1 class="title" style="font-size:20px">刺客确认</h1>' +
      '<div class="card"><div class="sec-title">刺客请点击你自己的名字确认身份（防误触）</div><div class="grid2">';
    for (let i = 0; i < S.numPlayers; i++) {
      h += '<button class="pbtn" onclick="assConfirm(' + i + ')">' + esc(S.players[i].name) + '</button>';
    }
    h += '</div></div>';
    return h;
  }
  // choose：从所有好人玩家中指认"梅林"
  let h = '<h1 class="title" style="font-size:20px">指认梅林</h1>' +
    '<div class="card gold"><div class="sec-title">刺客 <b style="color:var(--bad)">' + esc(S.players[ass.assassin].name) + '</b> 请操作</div>' +
    '<div style="font-size:16px">从以下好人玩家中，选择一人指认为梅林。指中则坏人获胜。</div></div><div class="grid2">';
  S.players.forEach((p, i) => {
    if (isGood(p)) h += '<button class="pbtn gold" onclick="assChoose(' + i + ')">' + esc(p.name) + '</button>';
  });
  h += '</div>';
  return h;
}
function assDiscussDone() {
  S.ass.stage = 'confirm'; save(); render();
}

/* ---------- 结局 ---------- */
function renderGameOver() {
  const o = S.over;
  const goodWin = o.winner === 'good';
  let h = '<h1 class="title" style="font-size:22px">对局结束</h1>' +
    '<div class="card"><div class="bigtext ' + (goodWin ? 'good' : 'bad') + '">' +
    (goodWin ? '🎉 好人阵营获胜' : '🔥 坏人阵营获胜') + '</div>' +
    '<div class="hint">' + esc(o.reason) + '</div></div>';
  if (o.assGuess != null) {
    h += '<div class="card"><div class="sec-title">刺杀复盘</div>' +
      '<div style="font-size:17px;line-height:2">刺客指认了 <b style="color:var(--bad)">' + esc(S.players[o.assGuess].name) + '</b><br>' +
      '真实的梅林是 <b style="color:var(--good)">' + esc(S.players[o.merlinIdx].name) + '</b></div></div>';
  }
  h += renderQuestDots();
  if (R.revealAll) {
    h += '<div class="card"><div class="sec-title">全员身份复盘</div><div class="grid2">';
    S.players.forEach(p => {
      const info = ROLES[p.role];
      h += '<div class="pbtn" style="cursor:default;display:flex;flex-direction:column;justify-content:center">' +
        '<span style="font-size:13px;color:var(--text-dim)">' + esc(p.name) + '</span>' +
        '<span style="font-size:17px;font-weight:700;color:' + (info.team === 'good' ? 'var(--good)' : 'var(--bad)') + '">' +
        info.emoji + ' ' + info.name + '</span></div>';
    });
    h += '</div></div>';
    // 复盘：逐任务揭晓每个人投了什么（只在最终复盘、且点了"揭晓身份"后显示）
    if (S.questLog && S.questLog.length) {
      h += '<div class="card"><div class="sec-title">任务投票明细（复盘）</div>';
      S.questLog.forEach(log => {
        const title = '第 ' + (log.round + 1) + ' 个任务 · ' +
          (log.outcome === 'success' ? '成功' : '失败') + '（失败牌 ' + log.fails + '）';
        h += '<div style="margin-top:10px"><div style="font-size:13.5px;color:var(--gold);margin-bottom:6px">' + title + '</div>' +
          '<div class="chips" style="justify-content:flex-start;margin-top:0">' +
          log.votes.map(v => '<span class="chip ' + (v.v === 'success' ? 'yes' : 'no') + '">' +
            esc(S.players[v.p].name) + '·' + (v.v === 'success' ? '成功' : '失败') + '</span>').join('') +
          '</div></div>';
      });
      h += '</div>';
    }
  } else {
    h += '<button class="btn gold" onclick="toggleRevealAll()">🎭 揭晓全员身份</button>';
  }
  h += '<button class="btn good" onclick="newGame()">🔄 开始新一局</button>';
  return h;
}

