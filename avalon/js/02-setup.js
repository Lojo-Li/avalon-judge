/* =====================================================================
 * 设置 setup
 * 两步设置页草稿、人数与姓名、角色勾选、校验与开局发牌
 * 由 v1 单文件版按功能切分，逻辑逐字未改。加载顺序见 index.html，不可调换。
 * ===================================================================== */
'use strict';
/* ====================== 阶段 1：设置页 ====================== */
const DRAFT_FIELDS = ['percival','morgana','mordred','oberon'];
/* 主持人模式偏好单独存：开局会清设置草稿，偏好要能带到下一局 */
const JUDGE_MODE_KEY = 'avalon_judge_mode_v1';
function loadJudgeModePref() {
  try { return lsGet(JUDGE_MODE_KEY) === 'voice' ? 'voice' : 'human'; }
  catch (e) { return 'human'; }
}
function saveJudgeModePref(m) {
  try { lsSet(JUDGE_MODE_KEY, m); } catch (e) { /* 偏好非关键：存储不可用时忽略 */ }
}
function defaultSetup() {
  return { count: 5, page: 1, err: '', judgeMode: loadJudgeModePref(),
           names: Array.from({length:10}, () => ''),
           roles: { percival:false, morgana:false, mordred:false, oberon:false } };
}
/* ---------- 设置页草稿（独立于 LS_KEY 的明文键，绝不含身份秘密） ---------- */
function saveDraft() {
  if (!U) return;
  try {
    lsSet(DRAFT_KEY, JSON.stringify({
      count: U.count, names: U.names, roles: U.roles, page: U.page, judgeMode: U.judgeMode,
    }));
  } catch (e) { /* 草稿非关键：隐私模式 / 配额不足 / 序列化异常一律忽略 */ }
}
function loadDraft() {
  try {
    const raw = lsGet(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearDraft() {
  lsRemove(DRAFT_KEY);
}
/* 用草稿恢复 U：逐字段校验，坏数据一律回退默认，避免渲染出 undefined / NaN / [object Object] */
function restoreDraft() {
  const d = loadDraft();
  if (!d || typeof d !== 'object') return false;
  const base = defaultSetup();
  if (Number.isInteger(d.count) && d.count >= 5 && d.count <= 10) base.count = d.count;
  if (Array.isArray(d.names) && d.names.length >= 10) {
    base.names = d.names.slice(0, 10).map(s => (typeof s === 'string' ? s : ''));
  }
  if (d.roles && typeof d.roles === 'object') {
    for (const r of DRAFT_FIELDS) if (typeof d.roles[r] === 'boolean') base.roles[r] = d.roles[r];
  }
  if (d.page === 2) base.page = 2;
  if (d.judgeMode === 'voice' || d.judgeMode === 'human') base.judgeMode = d.judgeMode;
  U = base;
  return true;
}
function initSetup() {
  U = defaultSetup();   // 全新默认（newGame / abortGame / boot 无草稿时使用）
}
/* 有效玩家名：留空（或全空白）自动用座位号 "1号、2号…"；只取前 U.count 个 */
function effectiveNames() {
  return U.names.slice(0, U.count).map((s, i) => {
    const t = (typeof s === 'string' ? s : '').trim();
    return t || ((i + 1) + '号');
  });
}
/* 主持人模式：只在设置页第 1 步切换，默认人工裁判，显式选语音才启用自动托管 */
function setJudgeMode(m) {
  if (m !== 'human' && m !== 'voice') return;
  U.judgeMode = m; U.err = '';
  saveJudgeModePref(m); saveDraft(); render(true);
}
function setCount(n) {
  U.count = n; U.err = ''; saveDraft(); render(true);
}
function setName(i, v) {
  U.names[i] = v; saveDraft();   // 只存值 + 写草稿，绝不 render（避免输入中重绘丢失光标）
}
function toggleRole(r) {
  U.roles[r] = !U.roles[r]; U.err = ''; saveDraft(); render(true);
}
/* 第 1 页 → 第 2 页：先做姓名校验 */
function setupNext() {
  const err = validateNames();
  if (err) { U.err = err; render(true); return; }   // 姓名错误留在第 1 页
  U.err = ''; U.page = 2; saveDraft(); render();
}
/* 第 2 页 → 第 1 页：清错误、回退，姓名与角色勾选均保留在 U 中 */
function setupBack() {
  U.err = ''; U.page = 1; saveDraft(); render();
}
/* 姓名校验（第 1 页"下一步"用）：基于有效名做重名检查，覆盖"默认名 vs 手填名"撞车 */
function validateNames() {
  const seen = new Set();
  for (const s of effectiveNames()) {
    if (seen.has(s)) return '玩家名字不能重复："' + s + '" 出现了多次（留空会自动用座位号命名，请勿与手填名重复）。';
    seen.add(s);
  }
  return null;
}
/* 角色组合校验（第 2 页"开始游戏"用）：沿用原有规则与中文文案 */
function validateRoles() {
  const n = U.count;
  const badN = BAD_COUNT[n];
  const checkedBad = ['morgana','mordred','oberon'].filter(r => U.roles[r]);
  // 坏人名额校验：刺客为固定角色，占 1 个坏人位
  if (1 + checkedBad.length > badN) {
    return n + ' 人局只有 ' + badN + ' 个坏人名额：刺客固定占 1 席' +
      (checkedBad.length ? '，你又勾选了 ' + checkedBad.length + ' 个坏角色（' + checkedBad.map(r=>ROLES[r].name).join('、') + '）' : '') +
      '，超出名额，请减少勾选。';
  }
  // 5 人局勾选派西维尔时，必须同时勾选莫德雷德或莫甘娜
  // （否则派西维尔只能看到梅林一人，等于直接指认梅林，破坏平衡）
  if (U.roles.percival && n === 5 && !U.roles.morgana && !U.roles.mordred) {
    return '5 人局勾选了派西维尔，必须同时勾选【莫甘娜】或【莫德雷德】，否则派西维尔的信息会直接暴露梅林。请调整后再开局。';
  }
  return null;
}
/* 开局前完整校验（兜底）：姓名 + 角色组合 */
function validateSetup() {
  return validateNames() || validateRoles();
}
function startGame() {
  const err = validateSetup();
  if (err) { U.err = err; render(true); return; }
  const n = U.count;
  // 组建身份池：梅林 + 刺客固定；勾选角色占对应阵营名额；其余按好/坏比例补齐忠臣/爪牙
  const pool = ['merlin', 'assassin'];
  if (U.roles.percival) pool.push('percival');
  ['morgana','mordred','oberon'].forEach(r => { if (U.roles[r]) pool.push(r); });
  const goodN = n - BAD_COUNT[n];
  let loyalists = goodN - pool.filter(r => ROLES[r].team === 'good').length;
  let minions   = BAD_COUNT[n] - pool.filter(r => ROLES[r].team === 'bad').length;
  while (loyalists-- > 0) pool.push('loyalist');
  while (minions--  > 0) pool.push('minion');
  shuffle(pool);
  const names = effectiveNames();   // 留空自动补默认名，与校验/摘要共用同一逻辑
  S = {
    screen: 'DEAL',
    judgeMode: U.judgeMode === 'voice' ? 'voice' : 'human',
    numPlayers: n,
    players: names.map((name, i) => ({ name, role: pool[i] })),
    round: 0,                        // 当前任务下标 0-4
    leaderIdx: Math.floor(Math.random() * n),  // 开局随机队长
    voteTrack: 0,                    // 本任务连续否决次数（满 5 坏人胜）
    questResults: [null, null, null, null, null],
    dealIdx: 0,
    eyesSteps: null, eyesStep: 0,
    team: [], teamMsg: '',
    tv: null,                        // 组队投票状态（线下举手 → 记账票数，无逐人投票）
    qv: { order: [], votes: [], idx: 0, stage: 'gate', pending: null, failCount: 0, outcome: null },
    questLog: [],                    // 每个任务的队伍与投票明细（仅复盘用，混淆存储）
    ass: null,
    over: null,
  };
  initEyesSteps();
  resetRuntime();
  // 状态已确定为 DEAL：无论持久化是否成功，都必须清草稿并重绘，
  // 绝不留下"状态已变、页面未变"的半途态（save 内部亦已吞异常）。
  try {
    save();
  } finally {
    clearDraft();        // 开局成功：设置草稿不再需要，清除以免污染下一局的 newGame
    render();
  }
}
