/* =====================================================================
 * 对局流程 game
 * 睁眼脚本、组队、发车记票、任务秘密投票、刺杀、结局与放弃本局
 * 由 v1 单文件版按功能切分，逻辑逐字未改。加载顺序见 index.html，不可调换。
 * ===================================================================== */
'use strict';
function initEyesSteps() {
  // 官方睁眼脚本；无派西维尔则跳过对应两步
  // say = 语音裁判专用完整自述口令（无人补话也能听懂）；big/note 仍供人工模式照读。
  // 全部只念公开口令，绝不念 eyesSecretList() 里的姓名名单。
  const hasPercival = S.players.some(p => p.role === 'percival');
  S.eyesSteps = [
    { big: '请全员闭眼', note: '天黑请闭眼', secret: null,
      say: '天黑了，请所有人闭眼，把手机平放在桌面中央，不要出声。' },
    { big: '坏人请睁眼', note: '坏人互认（奥伯伦不睁眼）', secret: 'evil',
      say: '请所有坏人睁眼，认出你的同伴。奥伯伦不睁眼。认完了也不要出声。' },
    { big: '坏人请闭眼', note: '', secret: null,
      say: '请所有坏人闭眼。' },
    { big: '坏人请竖拇指，梅林请睁眼', note: '梅林辨认坏人（莫德雷德不会竖拇指）', secret: 'merlin',
      say: '请所有坏人竖起拇指，梅林请睁眼，记住你看到的坏人。看完不要出声。' },
    { big: '梅林请闭眼', note: '', secret: null,
      say: '请梅林闭眼，所有坏人放下拇指。' },
  ];
  if (hasPercival) {
    S.eyesSteps.push({ big: '梅林、莫甘娜请竖拇指，派西维尔请睁眼', note: '派西维尔辨认（分不清谁是真梅林）', secret: 'percival',
      say: '请梅林和莫甘娜竖起拇指，派西维尔请睁眼。这两位里有一位是梅林，你分不出真假。看完不要出声。' });
    S.eyesSteps.push({ big: '派西维尔请闭眼', note: '', secret: null,
      say: '请派西维尔闭眼，请所有人放下拇指。' });
  }
  S.eyesSteps.push({ big: '全员请睁眼', note: '天亮了，对局开始', secret: null,
    say: '天亮了，请全员睁眼。对局开始，请拿回手机。' });
}
function resetRuntime() {
  R.dealStage = 'hidden'; R.eyesShown = false; R.revealAll = false;
  R.confirmAbort = false;   // 进入新阶段 / 新一局时取消未完成的"放弃本局"二次确认
  voiceStop();              // 离开 EYES / 刷新恢复时一律停播，避免无人值守时突然开念
  R.voice = defaultVoiceState();
  clearToast();
}

/* ====================== 阶段 2：递牌看身份 ====================== */
function dealShow()  { R.dealStage = 'shown'; render(); }
function dealHide()  { R.dealStage = 'handoff'; render(); }   // "我知道了" → 交接提示
function dealNext() {
  R.dealStage = 'hidden';
  if (S.dealIdx < S.numPlayers - 1) { S.dealIdx++; save(); }
  render();
}
function dealFinish() {
  S.screen = 'EYES'; S.eyesStep = 0;
  resetRuntime();
  save(); render();
}

/* ====================== 阶段 3：睁眼引导 ====================== */
function eyesToggle() { R.eyesShown = !R.eyesShown; render(); }
function eyesNext() {
  R.eyesShown = false;
  if (S.eyesStep < S.eyesSteps.length - 1) { S.eyesStep++; save(); render(); }
  else { initTeamPhase(); }
}

/* ====================== 语音裁判：EYES 阶段全自动托管 ======================
 * v15：播报改为播放站点内置的预录中文音频（js/00-audio.js，mp3 base64）。
 * 不再依赖浏览器 speechSynthesis / 系统中文语音包，微信 WebView 与外部浏览器同一路径。
 * 播放优先 Web Audio AudioBuffer（点击时 resume 一次即可连续播完全部口令），
 * 解码不可用时退回 <audio data:uri>，再不行转全自动字幕托管，绝不卡住对局。
 * 红线不变：只播 step.say 公开口令，绝不播 eyesSecretList() 里的姓名名单。
 * 运行时状态全在 R.voice（不入库）；刷新回到准备页，不会无人值守时突然开念。 */
let VOICE_AUDIO = null;   // 复用的 AudioContext（用户手势里 resume 一次）
let VOICE_SRC = null;     // 当前 BufferSource
let VOICE_HTML = null;    // HTMLAudioElement 兜底
let VOICE_BUFFERS = {};   // 口令文本 → 解码后的 AudioBuffer
let VOICE_DECODE = null;  // 解码 Promise（幂等）

function inWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent || '');
}
function voiceUnlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!VOICE_AUDIO) VOICE_AUDIO = new AC();
    if (VOICE_AUDIO.state === 'suspended') VOICE_AUDIO.resume();
  } catch (e) { VOICE_AUDIO = null; }
}
/* 每步开始一声极轻的双音；同时在点击手势里真正解锁音频输出 */
function voiceBeep() {
  try {
    if (!VOICE_AUDIO || VOICE_AUDIO.state !== 'running') return;
    const t = VOICE_AUDIO.currentTime;
    [660, 880].forEach((f, i) => {
      const o = VOICE_AUDIO.createOscillator(), g = VOICE_AUDIO.createGain();
      const s = t + i * 0.16;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.09, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.14);
      o.connect(g); g.connect(VOICE_AUDIO.destination);
      o.start(s); o.stop(s + 0.15);
    });
  } catch (e) { /* 没提示音也要继续 */ }
}
function voiceB64ToBytes(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function voiceDecodeOne(ctx, u8) {
  return new Promise(resolve => {
    let done = false;
    const fin = x => { if (!done) { done = true; resolve(x || null); } };
    try {
      const p = ctx.decodeAudioData(u8.buffer, fin, () => fin(null));
      if (p && typeof p.then === 'function') p.then(fin, () => fin(null));
    } catch (e) { fin(null); }
  });
}
/* 页面启动即预解码全部口令；true = 音频包可用（Web Audio 或 data-uri 至少一路能播） */
function voiceEnsureClips() {
  if (VOICE_DECODE) return VOICE_DECODE;
  const clips = window.AVALON_VOICE_CLIPS;
  if (!clips || !Object.keys(clips).length) { VOICE_DECODE = Promise.resolve(false); return VOICE_DECODE; }
  voiceUnlockAudio();
  const ctx = VOICE_AUDIO;
  if (!ctx || typeof ctx.decodeAudioData !== 'function') {
    VOICE_DECODE = Promise.resolve(true);       // 无 Web Audio 时仍可用 <audio> 播
    return VOICE_DECODE;
  }
  VOICE_DECODE = (async () => {
    try {
      const keys = Object.keys(clips);
      const res = await Promise.all(keys.map(k => voiceDecodeOne(ctx, voiceB64ToBytes(clips[k]))));
      keys.forEach((k, i) => { if (res[i]) VOICE_BUFFERS[k] = res[i]; });
    } catch (e) { /* 解码失败仍可走 <audio> 兜底 */ }
    return true;
  })();
  return VOICE_DECODE;
}
function voiceClipFor(text) { return (window.AVALON_VOICE_CLIPS || {})[text] || ''; }
function voiceClipDuration(text) {
  const b = VOICE_BUFFERS[text];
  return b ? b.duration * 1000 : text.length * 340;
}
/* 底层：播一句，结束/失败回调 finish(ok)。不碰流程状态，便于试听复用。 */
function voicePlayOne(text, finish) {
  const b64 = voiceClipFor(text);
  const buf = VOICE_BUFFERS[text];
  let settled = false;
  const done = ok => { if (!settled) { settled = true; finish(ok); } };
  if (buf && VOICE_AUDIO) {
    try {
      if (VOICE_AUDIO.state === 'suspended') VOICE_AUDIO.resume();
      const src = VOICE_AUDIO.createBufferSource();
      src.buffer = buf;
      src.connect(VOICE_AUDIO.destination);
      src.onended = () => { if (VOICE_SRC === src) VOICE_SRC = null; done(true); };
      VOICE_SRC = src;
      src.start(0);
      return;
    } catch (e) { /* 落到 <audio> */ }
  }
  if (!b64) { done(false); return; }
  try {
    const a = new Audio();
    VOICE_HTML = a;
    a.src = 'data:audio/mpeg;base64,' + b64;
    a.onended = () => { if (VOICE_HTML === a) VOICE_HTML = null; done(true); };
    a.onerror = () => done(false);
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => done(false));
  } catch (e) { done(false); }
}
function voiceStopSrc() {
  if (VOICE_SRC) {
    try { VOICE_SRC.onended = null; VOICE_SRC.stop(); } catch (e) {}
    VOICE_SRC = null;
  }
  if (VOICE_HTML) {
    try { VOICE_HTML.pause(); VOICE_HTML.onended = null; VOICE_HTML.onerror = null; VOICE_HTML.src = ''; } catch (e) {}
    VOICE_HTML = null;
  }
}
function voiceStop() {
  try {
    if (R.voice) {
      clearTimeout(R.voice.timer); clearTimeout(R.voice.guard);
      R.voice.seq = (R.voice.seq || 0) + 1;   // 让所有在途回调失效
      R.voice.timer = null; R.voice.guard = null;
    }
  } catch (e) {}
  voiceStopSrc();
  try { if (window.speechSynthesis && window.speechSynthesis.cancel) window.speechSynthesis.cancel(); } catch (e) {}
}
/* 内置音频包缺失 / 连续播放失败 → 全自动字幕托管（不切回人工，现场未必有裁判） */
function voiceToSilent(msg) {
  voiceStop();
  R.voice.stage = 'ready';       // 回准备页，先看清说明再点开始
  R.voice.silent = true;
  R.voice.fallback = false;
  R.voice.failCount = 0;
  R.voice.notice = msg || '这台设备没能播放内置语音，已切换为字幕托管：每步口令会放大显示在屏幕上，并自动进入下一步。';
  R.eyesShown = false;
  render();
}
/* 播一句，播完（或超时兜底）回调 onDone。seq 保证暂停/跳过后的旧回调不会串台。 */
function voiceSpeak(text, onDone) {
  if (R.voice.silent) {
    voiceBeep();                 // 字幕已由 renderEyes() 放大显示，这里只负责提醒与推进
    onDone();
    return;
  }
  const seq = ++R.voice.seq;
  let done = false;
  const finish = ok => {
    if (done || seq !== R.voice.seq || R.voice.stage !== 'running') return;
    done = true;
    clearTimeout(R.voice.guard); R.voice.guard = null;
    if (!ok && ++R.voice.failCount >= 2) { voiceToSilent(); return; }
    if (ok) R.voice.failCount = 0;
    onDone();
  };
  voicePlayOne(text, finish);
  if (!done) {
    R.voice.guard = setTimeout(() => {
      if (done) return;
      voiceStopSrc();
      finish(false);
    }, Math.max(9000, voiceClipDuration(text) + 3000));
  }
}
function voicePlayStep() {
  if (R.voice.stage !== 'running' || !S || S.screen !== 'EYES') return;
  const step = S.eyesSteps[S.eyesStep];
  if (!step) { voiceFinish(); return; }
  R.eyesShown = !!step.secret;    // 名单自动展开，进入下一步自动收起
  R.voice.notice = '';
  render();
  const text = step.say || step.big;
  voiceSpeak(text, () => {
    // 字幕要留时间读屏幕；语音版带名单的步骤留足看屏幕时间
    const wait = R.voice.silent
      ? (step.secret ? 10000 : 6500)
      : (step.secret ? 6000 : 2200);
    R.voice.timer = setTimeout(voiceAdvance, wait);
  });
}
function voiceAdvance() {
  if (R.voice.stage !== 'running') return;
  R.eyesShown = false;
  if (S.eyesStep < S.eyesSteps.length - 1) { S.eyesStep++; save(); voicePlayStep(); }
  else voiceFinish();
}
function voiceFinish() {
  voiceStop();
  R.voice.stage = 'done';
  eyesNext();                     // 最后一步 → 组队（内部 resetRuntime 会再停一次播报）
}
function voiceStart() {
  voiceUnlockAudio();
  voiceBeep();                    // 首次点击的同步栈里实际出一次声，解锁 iOS / 微信输出
  R.voice.seq = 0;
  R.voice.failCount = 0;
  R.voice.fallback = false;
  R.voice.silent = false;
  R.voice.notice = '正在准备语音…';
  R.voice.stage = 'running';
  S.eyesStep = 0; R.eyesShown = false; save();
  render();                       // 点了立刻有反馈，不能「按了没反应」
  const mySeq = R.voice.seq;
  voiceEnsureClips().then(ok => {
    if (!R.voice || R.voice.stage !== 'running' || R.voice.seq !== mySeq) return;
    if (!ok) { voiceToSilent('内置语音包未能加载，已切换为字幕托管。'); return; }
    R.voice.notice = '';
    voicePlayStep();
  });
}
/* 静音场合：不播声音，只用大字字幕自动托管 */
function voiceStartSilent() {
  voiceUnlockAudio();
  voiceBeep();
  R.voice.seq = 0;
  R.voice.failCount = 0;
  R.voice.fallback = false;
  R.voice.silent = true;
  R.voice.notice = '';
  R.voice.stage = 'running';
  S.eyesStep = 0; R.eyesShown = false; save();
  voicePlayStep();
}
function voicePause() {
  if (R.voice.stage !== 'running') return;
  voiceStop();
  R.voice.stage = 'paused';
  render(true);
}
function voiceResume() {
  if (R.voice.stage !== 'paused') return;
  R.voice.stage = 'running';
  voicePlayStep();                // 从本句开头重播，避免半句接不上
}
function voiceReplay() {
  if (R.voice.stage !== 'running' && R.voice.stage !== 'paused') return;
  voiceStop();
  R.voice.stage = 'running';
  R.voice.failCount = 0;
  voicePlayStep();
}
function voiceSkip() {
  if (R.voice.stage !== 'running' && R.voice.stage !== 'paused') return;
  voiceStop();
  R.voice.stage = 'running';
  voiceAdvance();
}
/* 试听：直接在点击手势内用 <audio> 播第一句，不等解码，也不依赖 Web Audio 状态 */
function voicePreview() {
  voiceUnlockAudio();
  voiceBeep();
  const first = S.eyesSteps && S.eyesSteps[0] && (S.eyesSteps[0].say || S.eyesSteps[0].big);
  const b64 = first ? voiceClipFor(first) : '';
  if (!b64) { R.voice.notice = '内置语音包未加载，可改用「只用字幕」。'; render(true); return; }
  R.voice.notice = '正在试听…请调高媒体音量';
  render(true);
  const fail = () => { R.voice.notice = '试听没能播放，可改用「只用字幕」或直接用字幕托管。'; render(true); };
  try {
    const a = new Audio();
    VOICE_HTML = a;
    a.src = 'data:audio/mpeg;base64,' + b64;
    a.onended = () => {
      if (VOICE_HTML === a) VOICE_HTML = null;
      R.voice.notice = '已试听一句。没听到声音请调高媒体音量、关闭静音。';
      render(true);
    };
    a.onerror = fail;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(fail);
  } catch (e) { fail(); }
}
function voiceUseHuman() {
  voiceStop();
  S.judgeMode = 'human';
  saveJudgeModePref('human');
  save();
  R.voice = defaultVoiceState();
  render();
}
/* 旧版本把本局写死成人工后，从人工睁眼页一键改回全自动托管（不重开、身份不变） */
function voiceRecover() {
  voiceStop();
  S.judgeMode = 'voice';
  saveJudgeModePref('voice');
  save();
  R.voice = defaultVoiceState();
  R.voice.notice = '已改回全自动托管，点下方开始（从第一步重走一遍）。';
  render();
}

/* ====================== 阶段 4：组队 ====================== */
function initTeamPhase() {
  S.screen = 'TEAM_BUILD';
  S.team = [S.leaderIdx];   // 队长默认在队
  S.teamMsg = '';
  resetRuntime();
  save(); render();
}
function toggleTeam(i) {
  const k = S.team.indexOf(i);
  if (k >= 0) S.team.splice(k, 1); else S.team.push(i);
  S.teamMsg = '';
  save(); render();
}
function confirmTeam() {
  const need = QUEST_TABLE[S.numPlayers][S.round];
  if (S.team.length !== need) {
    S.teamMsg = '还需选择 ' + (need - S.team.length) + ' 名队员（当前任务需要 ' + need + ' 人，已选 ' + S.team.length + ' 人）。';
    render(); return;
  }
  // 房规：同一任务连续 2 次被否决后，第 3 次组队自动通过，不再投票
  if (S.voteTrack >= 2) {
    S.tv = { stage: 'forced', yes: 0, no: 0, pass: true, msg: '' };
  } else {
    S.tv = { stage: 'count', yes: 0, no: 0, pass: null, msg: '' };
  }
  S.screen = 'TEAM_VOTE';
  save(); render();
}

/* ====================== 阶段 5：组队投票（线下举手 → 记票数） ====================== */
// 调整赞成/反对人数：clamp 到 [0, 总人数 - 另一方]，避免超员
function tvSet(kind, delta) {
  const tot = S.numPlayers;
  const other = kind === 'yes' ? 'no' : 'yes';
  let v = S.tv[kind] + delta;
  if (v < 0) v = 0;
  const max = tot - S.tv[other];
  if (v > max) v = max;
  if (v === S.tv[kind]) return;
  S.tv[kind] = v;
  S.tv.msg = '';
  save(); render();
}
// 全票 / 清零 快捷操作
function tvFill(kind) {
  const tot = S.numPlayers;
  S.tv.yes = kind === 'yes' ? tot : 0;
  S.tv.no  = kind === 'yes' ? 0 : tot;
  S.tv.msg = '';
  save(); render();
}
function tvReset() { S.tv.yes = 0; S.tv.no = 0; S.tv.msg = ''; save(); render(); }
// 票数填错时退回记票页
function tvEdit() { S.tv.stage = 'count'; S.tv.pass = null; S.tv.msg = ''; save(); render(); }
function tvSubmit() {
  const tot = S.numPlayers;
  const sum = S.tv.yes + S.tv.no;
  if (sum !== tot) {
    S.tv.msg = '请核对人数：已统计 ' + sum + ' 人，还有 ' + (tot - sum) + ' 人未计入（全场共 ' + tot + ' 人）。';
    render(); return;
  }
  // 官方规则：赞成票严格过半才通过；平票视为否决
  S.tv.pass = S.tv.yes * 2 > tot;
  S.tv.stage = 'result';
  save(); render();
}
function teamVoteContinue() {
  if (S.tv.pass) {
    // 通过 → 任务执行：队员投票顺序随机打乱
    S.qv = {
      order: shuffle(S.team.slice()),
      votes: [], idx: 0, stage: 'gate', pending: null,
      failCount: 0, outcome: null,
    };
    S.screen = 'QUEST';
    save(); render();
  } else {
    // 否决 → 投票轨 +1，队长顺延重新组队
    // 注：房规"连否 2 次后第 3 次必发车"使官方"5 次否决坏人胜"不可能触发，故不再保留该判定
    S.voteTrack++;
    S.leaderIdx = (S.leaderIdx + 1) % S.numPlayers;
    initTeamPhase();
  }
}

/* ====================== 阶段 6：任务（秘密投票） ====================== */
// 当前应投票的玩家（座位下标）
function qvVoter() { return S.qv.order[S.qv.idx]; }
// 闸门页："是我" → 进入投票界面（防误触：先确认设备在谁手上）
function qvBegin() { S.qv.stage = 'vote'; S.qv.pending = null; render(); }
// 选择成功/失败 → 进入二次确认页（给出明确反馈，防止手滑）
function qvPick(vote) {
  const p = S.players[qvVoter()];
  if (vote === 'fail' && isGood(p)) {
    // 好人阵营只能投成功：不计票，给出明确中文说明
    S.qv.pending = null;
    showToast('好人阵营只能投【成功】票，请重新选择。');
    return;
  }
  S.qv.pending = vote;
  S.qv.stage = 'confirm';
  clearToast();
  save(); render();
}
function qvReselect() { S.qv.pending = null; S.qv.stage = 'vote'; save(); render(); }
function qvConfirm() {
  const vote = S.qv.pending;
  if (!vote) return;
  S.qv.votes.push({ p: qvVoter(), v: vote });   // 记录到具体座位，仅用于最终复盘
  S.qv.idx++;
  S.qv.pending = null;
  if (S.qv.idx >= S.qv.order.length) S.qv.stage = 'ready'; // 全部投完，等裁判公布
  else S.qv.stage = 'gate';
  save(); render();
}
function revealQuest() {
  // 公布结果：只公布失败牌张数与任务成败（不公布谁投了什么）
  const fails = S.qv.votes.filter(x => x.v === 'fail').length;
  // 7~10 人局的第 4 个任务（下标 3）需要 2 张失败牌才算失败，其余 1 张即失败
  const need = (S.round === 3 && S.numPlayers >= 7) ? 2 : 1;
  S.qv.failCount = fails;
  S.qv.outcome = fails >= need ? 'fail' : 'success';
  S.qv.stage = 'reveal';
  save(); render();
}
function questContinue() {
  S.questResults[S.round] = S.qv.outcome;
  // 记录本任务队伍与逐人投票（只在最终复盘页展示，回合内严格保密）
  S.questLog.push({
    round: S.round,
    team: S.team.slice(),
    votes: S.qv.votes.slice(),
    fails: S.qv.failCount,
    outcome: S.qv.outcome,
  });
  const succ = S.questResults.filter(x => x === 'success').length;
  const fail = S.questResults.filter(x => x === 'fail').length;
  if (fail >= 3) {
    // 终局条件 1：三个任务失败 → 坏人胜
    gameOver('bad', '三个任务失败，坏人阵营获胜！');
  } else if (succ >= 3) {
    // 终局条件 2：三个任务成功 → 进入刺杀阶段
    startAssassinate();
  } else {
    S.round++;
    S.leaderIdx = (S.leaderIdx + 1) % S.numPlayers;  // 队长顺延
    S.voteTrack = 0;
    initTeamPhase();
  }
}

/* ====================== 阶段 7：刺杀 ====================== */
function startAssassinate() {
  S.screen = 'ASSASSINATE';
  S.ass = { stage: 'discuss', assassin: null, target: null };
  resetRuntime();
  save(); render();
}
function assConfirm(i) { S.ass.assassin = i; S.ass.stage = 'choose'; save(); render(); }
function assChoose(i) {
  // 判定：指中真梅林 → 坏人胜；否则好人胜
  S.ass.target = i;
  const hit = S.players[i].role === 'merlin';
  gameOver(hit ? 'bad' : 'good',
    hit ? '刺客指认命中梅林，坏人阵营获胜！' : '刺客指认失败，好人阵营获胜！');
}

/* ====================== 阶段 8：结局 ====================== */
function gameOver(winner, reason) {
  S.screen = 'GAME_OVER';
  S.over = {
    winner, reason,
    assGuess: S.ass && S.ass.target != null ? S.ass.target : null,
    merlinIdx: S.players.findIndex(p => p.role === 'merlin'),
    revealed: false,
  };
  resetRuntime();
  save(); render();
}
function toggleRevealAll() { R.revealAll = !R.revealAll; render(); }
function newGame() {
  // 全部走安全封装：即使存储被禁，后续清空状态与 render() 也一定执行
  lsRemove(LS_KEY);
  clearDraft();          // 回到干净的第 1 页，不残留上一局的设置草稿
  S = null;
  initSetup();
  resetRuntime();
  render();
}
/* 「放弃本局」改为页内二次确认：不依赖 window.confirm
 * （部分 iframe / WebView 会静默阻止原生 confirm，用户点"是"也没反应）。 */
function abortGame() {
  if (!R.confirmAbort) {
    R.confirmAbort = true;
    render();
    // render() 会滚回顶部，把确认区滚入视野，避免"点了没反应"的错觉
    try {
      const el = document.getElementById('abortConfirm');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    } catch (e) {}
    return;
  }
  R.confirmAbort = false;
  newGame();
}
function cancelAbort() {
  R.confirmAbort = false;
  render();
}

