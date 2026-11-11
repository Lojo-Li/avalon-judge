/* =====================================================================
 * 核心 core
 * 常量 / 安全存储 / 规则表 / 全局状态 / 工具 / 脱敏持久化 / 视角名单
 * 由 v1 单文件版按功能切分，逻辑逐字未改。加载顺序见 index.html，不可调换。
 * ===================================================================== */
'use strict';
/* =====================================================================
 * 阿瓦隆 · 单机电子裁判（单文件实现）
 * 状态机：SETUP → DEAL → EYES → TEAM_BUILD → TEAM_VOTE → QUEST
 *         → (ASSASSINATE) → GAME_OVER
 * 秘密安全：身份/名单等秘密只在内存（R 对象）中短暂展示，绝不写入
 * localStorage；localStorage 中的角色字段做了可逆混淆（脱敏），
 * 且刷新后回到当前环节的"未展开秘密"状态，需重新点击展开。
 * ===================================================================== */

const LS_KEY = 'avalon_judge_state_v2';
const DRAFT_KEY = 'avalon_setup_draft_v1';   // 设置页草稿：明文，仅含人数/姓名/角色勾选/页码，与对局存档 LS_KEY 完全独立、互不干扰
const PROBE_KEY = 'avalon_storage_probe_v1'; // 仅 boot 时试写一次，探测浏览器是否允许本地存储

/* ---------- 安全存储封装 ----------
 * 预览面板 iframe / 隐私模式 / 部分手机浏览器会禁止 localStorage，
 * 极端情况下连读取 localStorage 对象本身都会抛 SecurityError。
 * 铁律：任何持久化失败都不得抛错、不得阻断调用方的状态变更与 render()。
 */
function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
}
function lsRemove(k) {
  try { localStorage.removeItem(k); return true; } catch (e) { return false; }
}
let STORAGE_OK = true;   // boot 探测结果：仅用于展示降级提示，绝不参与任何游戏逻辑
function probeStorage() {
  // 试写 → 读回 → 删除临时键；任一步失败都视为不可写
  try {
    if (!lsSet(PROBE_KEY, '1')) return false;
    if (lsGet(PROBE_KEY) !== '1') return false;
    lsRemove(PROBE_KEY);
    return true;
  } catch (e) { return false; }
}

/* ---------- 规则常量 ---------- */
// 任务人数表（按玩家数）
const QUEST_TABLE = { 5:[2,3,2,3,3], 6:[2,3,4,3,4], 7:[2,3,3,4,4], 8:[3,4,4,5,5], 9:[3,4,4,5,5], 10:[3,4,4,5,5] };
// 坏人数量表（好人数 = 总人数 - 坏人数）
const BAD_COUNT = { 5:2, 6:2, 7:3, 8:3, 9:3, 10:4 };

/* 身份卡立绘按编号存放于 cards/，文件名不含角色名，避免翻目录看穿身份。
   card 仅为展示用常量，不写入存档、不参与任何规则判定。 */
const ROLES = {
  merlin:   { name:'梅林',     team:'good', emoji:'🧙‍♂️', card:'cards/c01.jpg', desc:'你知道除莫德雷德外的所有坏人。隐藏自己，引导任务。' },
  percival: { name:'派西维尔', team:'good', emoji:'🛡️', card:'cards/c02.jpg', desc:'你知道梅林与莫甘娜是谁，但分不清谁是真梅林。' },
  loyalist: { name:'忠臣',     team:'good', emoji:'⚔️', card:'cards/c03.jpg', desc:'你只知道自己是好人。相信你的直觉。' },
  assassin: { name:'刺客',     team:'bad',  emoji:'🗡️', card:'cards/c04.jpg', desc:'好人三胜后，你有一次指认梅林的机会，指中则坏人获胜。' },
  morgana:  { name:'莫甘娜',   team:'bad',  emoji:'🌀', card:'cards/c05.jpg', desc:'坏人们知道你是谁。派西维尔会把你也当成梅林。' },
  mordred:  { name:'莫德雷德', team:'bad',  emoji:'👑', card:'cards/c06.jpg', desc:'梅林看不到你，你可以放心行动。' },
  oberon:   { name:'奥伯伦',   team:'bad',  emoji:'🌑', card:'cards/c07.jpg', desc:'你不认识其他坏人，其他人也看不到你。' },
  minion:   { name:'爪牙',     team:'bad',  emoji:'🤝', card:'cards/c08.jpg', desc:'坏人们彼此认识（奥伯伦除外）。破坏任务，保护刺客。' },
};
const isBad = p => ROLES[p.role].team === 'bad';
const isGood = p => ROLES[p.role].team === 'good';

/* ---------- 全局状态 ---------- */
let S = null;                 // 对局状态（可持久化，角色字段混淆存储）
let U = null;                 // 设置页状态：count/names/roles/page 存入独立草稿键 DRAFT_KEY，err 不持久化
/* 语音裁判运行时状态：只在内存里，绝不入库；刷新后一律回到准备页，避免无人值守时突然开念 */
function defaultVoiceState() {
  return { stage:'ready', seq:0, timer:null, guard:null, failCount:0, fallback:false, silent:false, notice:'' };
}
let R = { dealStage:'hidden', eyesShown:false, revealAll:false, confirmAbort:false, toast:'', toastTimer:null,
          voice: defaultVoiceState() };

/* ---------- 工具 ---------- */
function shuffle(a) { // Fisher-Yates 洗牌
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* 简单可逆混淆：XOR 后 base64。用于 localStorage 脱敏（防随手翻看，非加密）。 */
function obf(str) {
  let s = '';
  for (let i = 0; i < str.length; i++) s += String.fromCharCode(str.charCodeAt(i) ^ 0x5B);
  return btoa(s);
}
function deobf(b) {
  const s = atob(b);
  let out = '';
  for (let i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ 0x5B);
  return out;
}

/* ---------- 持久化（脱敏） ---------- */
/* save() 整体吞异常：即使持久化（或序列化）失败，也绝不把异常抛给调用方，
 * 保证 startGame() 等处的状态变更与 render() 不会被半途打断。 */
function save() {
  try {
    if (!S) { lsRemove(LS_KEY); return; }
    const c = JSON.parse(JSON.stringify(S));
    // 脱敏 1：角色身份混淆存储
    c.players = S.players.map(p => ({ name: p.name, role: obf(p.role) }));
    // 脱敏 2：任务秘密投票顺序与票面混淆存储（避免翻 localStorage 推断投票情况）
    c.qvOrder = obf(JSON.stringify(S.qv.order));
    c.qvVotes = obf(JSON.stringify(S.qv.votes));
    // 只存进度元信息，不存 pending（当前玩家尚未提交的选择属于秘密）
    c.qvMeta = obf(JSON.stringify({ idx: S.qv.idx, stage: S.qv.stage, failCount: S.qv.failCount, outcome: S.qv.outcome }));
    delete c.qv; // qv 明细不入库，加载时由混淆字段重建
    // 脱敏 3：复盘用的历史投票明细同样混淆（否则翻存档即可知道谁投了失败）
    c.questLog = obf(JSON.stringify(S.questLog || []));
    lsSet(LS_KEY, JSON.stringify(c));
  } catch (e) { /* 持久化失败：静默降级，本局仍可正常进行，绝不抛给调用方 */ }
}
function load() {
  try {
    const raw = lsGet(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    const s = JSON.parse(JSON.stringify(c));
    s.players = c.players.map(p => ({ name: p.name, role: deobf(p.role) }));
    s.qv = {
      order: JSON.parse(deobf(c.qvOrder)),
      votes: JSON.parse(deobf(c.qvVotes)),
      idx: 0, stage: 'gate', pending: null, failCount: 0, outcome: null,
    };
    // 恢复任务投票进度；pending 不落盘，刷新后回到"重新选牌"状态
    if (c.qvMeta) {
      const meta = JSON.parse(deobf(c.qvMeta));
      s.qv.idx = meta.idx || 0;
      s.qv.stage = meta.stage || 'gate';
      s.qv.failCount = meta.failCount || 0;
      s.qv.outcome = meta.outcome || null;
      if (s.qv.stage === 'confirm') s.qv.stage = 'vote';
      if (s.qv.stage !== 'reveal') {
        s.qv.stage = s.qv.idx >= s.qv.order.length ? 'ready' : (s.qv.stage === 'vote' ? 'vote' : 'gate');
      }
    }
    s.questLog = c.questLog ? JSON.parse(deobf(c.questLog)) : [];
    return s;
  } catch (e) { return null; }
}

/* ---------- 视角信息（内存态计算，绝不持久化名单） ---------- */
// 说明：v3 起递牌环节只展示本人身份，不再计算"你知道的人"；
// 所有队友互认信息统一在睁眼环节（eyesSecretList）按步骤显示。
// 睁眼环节：按秘密类型取名单
function eyesSecretList(kind) {
  if (kind === 'evil') {
    // 坏人互认：所有坏人，隐去奥伯伦
    return S.players.filter(p => isBad(p) && p.role !== 'oberon').map(p => p.name);
  }
  if (kind === 'merlin') {
    // 梅林睁眼：除莫德雷德外的所有坏人（含奥伯伦）
    return S.players.filter(p => isBad(p) && p.role !== 'mordred').map(p => p.name);
  }
  if (kind === 'percival') {
    // 派西维尔睁眼：梅林 + 莫甘娜（顺序打乱，不标真假）；无莫甘娜则只有梅林
    const names = S.players.filter(p => p.role === 'merlin' || p.role === 'morgana').map(p => p.name);
    return shuffle(names);
  }
  return [];
}

