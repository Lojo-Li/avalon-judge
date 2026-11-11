/* =====================================================================
 * 启动 boot
 * 全局错误兜底 + 存档探测 + 首次渲染；必须最后加载
 * 由 v1 单文件版按功能切分，逻辑逐字未改。加载顺序见 index.html，不可调换。
 * ===================================================================== */
'use strict';
/* 版本标识：head 里的自检脚本用它判断浏览器是否仍在执行旧缓存的 JS。
   每次发布务必同步递增 index.html 的 ?v= 与本常量。 */
window.APP_VERSION = 'v15';
/* ---------- 全局错误兜底 ----------
 * 未处理异常以前会表现为"点了完全没反应"；这里追加一条可见的中文提示。
 * 只操作 DOM、不触发 render()，避免与出错的 render 相互递归；
 * 后续任意一次正常 render() 会用 innerHTML 覆盖 #app，提示随之自动清除。
 * 整个处理过程自身再包一层 try/catch，保证兜底逻辑绝不二次抛错。
 */
if (typeof window !== 'undefined') {
  window.onerror = function (message) {
    try {
      const app = document.getElementById('app');
      if (!app) return false;
      let box = document.getElementById('globalErrBox');
      if (!box) {
        box = document.createElement('div');
        box.id = 'globalErrBox';
        box.className = 'toast';       // position:fixed，保证任何页面位置都可见
        box.style.whiteSpace = 'normal';
        box.style.maxWidth = '86vw';
        app.appendChild(box);
      }
      const m = (message == null || message === '') ? '未知错误' : String(message);
      box.textContent = '⚠️ 操作未能完成，请刷新页面重试；若反复出现请反馈此信息：' + m;
    } catch (e) { /* 兜底逻辑本身绝不再抛 */ }
    return false;   // 保留控制台错误上报，便于排查，不影响正常流程
  };
}

/* ---------- 启动 ---------- */
(function boot() {
  STORAGE_OK = probeStorage();   // 只探测一次，结果仅用于展示降级提示
  const saved = load();
  if (saved && saved.players && saved.players.length) {
    S = saved;
    // 刷新后回到当前环节，但处于"未展开秘密"状态（秘密展示仅内存态，不入库）
    resetRuntime();
    /* v13 及以前：语音播不出声会把本局写死成 human 并存进存档。
       偏好键仍是 voice（说明用户本意是语音裁判，而非主动点过「改用人工裁判」），
       自动恢复为托管模式，避免刷新后永远卡在人工睁眼页。 */
    if (S.screen === 'EYES' && S.judgeMode === 'human' && loadJudgeModePref() === 'voice') {
      S.judgeMode = 'voice';
      save();
      R.voice.notice = '已自动恢复全自动托管（旧版本误切回了人工）。本局身份不变，点下方开始即可。';
    }
  } else {
    initSetup();
    restoreDraft();   // 无对局存档时用草稿恢复：刷新后回到原页码，姓名与角色勾选都还在
  }
  render();
  voiceEnsureClips();   // 预解码内置语音包（异步、不阻塞首屏）
})();
