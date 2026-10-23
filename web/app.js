/* 全球市场参谋 - 前端逻辑 */
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? "—" : n.toFixed(d);
const sign = (v) => v > 0 ? "+" + fmt(v) : fmt(v);

let DATA = null;
let USDJPY = 155;

function fmtJPY(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "¥" + Math.round(n).toLocaleString();
}

/* ---------- 轻量 markdown 渲染 ---------- */
function md(text) {
  if (!text) return "";
  let t = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
  const lines = t.split("\n").map(l => {
    if (/^\s*[-*]\s/.test(l)) return l.replace(/^\s*[-*]\s/, "• ");
    return l;
  });
  return lines.join("\n");
}

/* ---------- 风险徽章 ---------- */
function badge(r) {
  const cls = !r || r.level === "数据不足" ? "" :
    r.level === "低风险" ? "risk-low" :
    r.level === "中风险" ? "risk-mid" :
    r.level === "中高风险" ? "risk-midhigh" : "risk-high";
  const txt = r ? r.level : "—";
  return `<span class="risk-badge ${cls}">${txt}</span>`;
}

/* ---------- 指数卡片 ---------- */
function renderIndexes() {
  const grid = $("index-grid");
  grid.innerHTML = (DATA.indexes || []).map(it => {
    const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
    const arrow = it.chg1d_pct > 0 ? "▲" : it.chg1d_pct < 0 ? "▼" : "—";
    return `<div class="grid-card">
      <div class="nm">${it.name} <span style="opacity:.6">· ${it.region}</span></div>
      <div class="px">${fmt(it.price, 0)}</div>
      <div class="ch ${c}">${arrow} ${sign(it.chg1d_pct)}%</div>
      <div class="nm" style="margin-top:4px">${badge(it.risk)}</div>
    </div>`;
  }).join("");
  $("idx-time").textContent = DATA.generated_at ? "更新 " + DATA.generated_at : "";
}

function renderFX() {
  const grid = $("fx-grid");
  const items = [...(DATA.fx || []), ...(DATA.commodities || [])];
  grid.innerHTML = items.map(it => {
    const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
    return `<div class="grid-card">
      <div class="nm">${it.name}</div>
      <div class="px">${fmt(it.price)}</div>
      <div class="ch ${c}">${sign(it.chg1d_pct)}%</div>
    </div>`;
  }).join("");
}

/* ---------- AI 解读 ---------- */
function renderAI() {
  const box = $("ai-text");
  const ai = DATA.ai;
  if (!ai || !ai.text) { box.textContent = "（AI 解读暂未生成）"; return; }
  box.innerHTML = md(ai.text);
}

/* ---------- 关注列表 ---------- */
function watchItem(it) {
  const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
  const metrics = [];
  if (it.rsi14 !== null && it.rsi14 !== undefined) metrics.push(`RSI <b>${fmt(it.rsi14, 0)}</b>`);
  if (it.vol20_annual_pct) metrics.push(`波动率 <b>${fmt(it.vol20_annual_pct, 0)}%</b>`);
  if (it.pct52w !== undefined) metrics.push(`52周位置 <b>${fmt(it.pct52w, 0)}%</b>`);
  if (it.pe) metrics.push(`PE <b>${fmt(it.pe, 1)}</b>`);
  if (it.trend === 2) metrics.push("趋势 <b>强势</b>");
  else if (it.trend === 0) metrics.push("趋势 <b>偏弱</b>");
  else metrics.push("趋势 <b>中性</b>");
  return `<div class="item">
    <div class="item-head">
      <div>
        <div class="item-name">${it.name} <span class="${c}">(${sign(it.chg1d_pct)}%)</span></div>
        <div class="item-sub">${it.symbol} · ${fmt(it.price)} USD${it.region ? " · " + it.region : ""}</div>
      </div>
      ${badge(it.risk)}
    </div>
    <div class="item-metrics">${metrics.join('<span class="metric">·</span>').replaceAll('<span class="metric">·</span><span class="metric">·</span>', '<span class="metric">·</span>')}</div>
  </div>`;
}

function renderWatch() {
  const etfs = (DATA.etfs || []).slice().sort((a, b) => (a.risk.score || 99) - (b.risk.score || 99));
  const stocks = (DATA.stocks || []).slice().sort((a, b) => (a.risk.score || 99) - (b.risk.score || 99));
  $("etf-list").innerHTML = etfs.map(watchItem).join("") || '<div class="card tip">暂无数据</div>';
  $("stock-list").innerHTML = stocks.map(watchItem).join("") || '<div class="card tip">暂无数据</div>';
}

/* ---------- 持仓 ---------- */
function getPortfolio() {
  try { return JSON.parse(localStorage.getItem("ma_portfolio") || "[]"); } catch { return []; }
}
function savePortfolio(list) { localStorage.setItem("ma_portfolio", JSON.stringify(list)); }

function addHolding(code, qty, cost) {
  const list = getPortfolio();
  list.push({ code: code.trim().toUpperCase(), qty: parseFloat(qty) || 0, cost: cost ? parseFloat(cost) : null });
  savePortfolio(list);
  renderPortfolio();
}

function renderPortfolio() {
  const list = getPortfolio();
  const box = $("portfolio-list");
  const sum = $("portfolio-summary");
  if (!list.length) { box.innerHTML = '<div class="card tip">还没有持仓，添加一个吧。</div>'; sum.style.display = "none"; return; }
  const pool = {};
  [...(DATA.etfs || []), ...(DATA.stocks || [])].forEach(x => pool[x.symbol] = x);
  let totalVal = 0, totalCost = 0, totalRisk = 0;
  const rows = list.map((h, i) => {
    const it = pool[h.code];
    let price, currency = "JPY", risk = null, extra = "";
    if (it) {
      price = it.price;
      currency = it.region === "US" || it.region === "Global" || it.region === "EM" || it.region === "Gold" || it.region === "Bond" ? "USD" : "JPY";
      risk = it.risk;
      extra = `<div class="sub">${it.name} · 风险 ${risk ? risk.level : "—"}</div>`;
    } else {
      extra = `<div class="sub">未在每日追踪池（仅记录，不诊断）</div>`;
    }
    const val = price ? (currency === "USD" ? price * h.qty * USDJPY : price * h.qty) : 0;
    const costVal = h.cost ? (currency === "USD" ? h.cost * h.qty * USDJPY : h.cost * h.qty) : null;
    totalVal += val;
    if (costVal) totalCost += costVal;
    const pnl = costVal ? val - costVal : null;
    return `<div class="port-row">
      <div>
        <div class="nm">${h.code} × ${h.qty}</div>
        ${extra}
      </div>
      <div style="text-align:right">
        <div class="nm">${fmtJPY(val)}</div>
        <div class="sub ${pnl !== null ? (pnl >= 0 ? 'up' : 'down') : ''}">${pnl !== null ? sign(pnl / costVal * 100) + "%" : "成本未填"}</div>
        <button class="del" data-i="${i}">删除</button>
      </div>
    </div>`;
  });
  box.innerHTML = rows.join("");
  document.querySelectorAll(".del").forEach(b => b.onclick = () => {
    const list2 = getPortfolio(); list2.splice(+b.dataset.i, 1); savePortfolio(list2); renderPortfolio();
  });
  sum.style.display = "block";
  const pct = totalCost ? ((totalVal - totalCost) / totalCost * 100) : null;
  sum.innerHTML = `<div class="card-title">持仓汇总（按今日收盘价）</div>
    <div class="row"><span>估算市值</span><b>${fmtJPY(totalVal)}</b></div>
    <div class="row"><span>估算盈亏</span><b class="${pct !== null ? (pct >= 0 ? 'up' : 'down') : ''}">${pct !== null ? sign(pct) + "%" : "—"}</b></div>
    <div class="hint">注：美股按今日 USD/JPY（${fmt(USDJPY)}）换算，汇率波动也会影响盈亏。</div>`;
}

/* ---------- SBI CSV 解析 ---------- */
function parseCSV(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim());
  if (!rows.length) return { ok: false, msg: "内容为空" };
  const header = rows[0].split(/[,，\t]/).map(s => s.trim());
  const codeIdx = header.findIndex(h => /コード|コード|code/i.test(h));
  const qtyIdx = header.findIndex(h => /数量|口数|株数/i.test(h));
  const costIdx = header.findIndex(h => /取得単価|取得価額|取得单价/i.test(h));
  const nameIdx = header.findIndex(h => /銘柄|ファンド名|名称/i.test(h));
  if (codeIdx < 0 && nameIdx < 0) return { ok: false, msg: "没找到「コード/銘柄」列，请确认复制的是持仓表" };
  const list = getPortfolio();
  let added = 0;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split(/[,，\t]/).map(s => s.trim());
    if (cells.length < 2) continue;
    let code = codeIdx >= 0 ? cells[codeIdx] : "";
    if (codeIdx < 0 && nameIdx >= 0) {
      // 日本投信无代码时用名称（可后续手动配代码）
      code = cells[nameIdx];
    }
    const qty = qtyIdx >= 0 ? parseFloat(cells[qtyIdx].replace(/[^0-9.\-]/g, "")) : 0;
    const cost = costIdx >= 0 ? parseFloat(cells[costIdx].replace(/[^0-9.\-]/g, "")) : null;
    if (!code || isNaN(qty) || qty <= 0) continue;
    list.push({ code, qty, cost });
    added++;
  }
  savePortfolio(list);
  return { ok: true, msg: "导入 " + added + " 条" };
}

/* ---------- 设置 ---------- */
function loadSettings() {
  const s = JSON.parse(localStorage.getItem("ma_settings") || "{}");
  if (s.risk) $("s-risk").value = s.risk;
}
function saveSettings() {
  localStorage.setItem("ma_settings", JSON.stringify({ risk: $("s-risk").value }));
  $("s-status").textContent = "已保存（风险偏好用于排序提示）";
}

/* ---------- 状态条 ---------- */
function toast(msg) {
  const bar = $("status-bar");
  bar.textContent = msg; bar.classList.add("show");
  setTimeout(() => bar.classList.remove("show"), 2600);
}

/* ---------- Tab ---------- */
function bindTabs() {
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("tab-" + t.dataset.tab).classList.add("active");
  });
}

/* ---------- 启动 ---------- */
async function init() {
  bindTabs();
  loadSettings();
  $("p-add").onclick = () => {
    const c = $("p-code").value, q = $("p-qty").value, cst = $("p-cost").value;
    if (!c || !q) { toast("请输入代码和数量"); return; }
    addHolding(c, q, cst);
    $("p-code").value = ""; $("p-qty").value = ""; $("p-cost").value = "";
    toast("已添加");
  };
  $("p-import").onclick = () => {
    const r = parseCSV($("p-csv").value);
    $("p-csv").value = "";
    toast(r.msg);
    renderPortfolio();
  };
  $("s-save").onclick = () => { saveSettings(); toast("设置已保存"); };
  try {
    const res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
  } catch (e) {
    $("ai-text").textContent = "数据加载失败：" + e.message + "（请确认已通过 GitHub Pages 部署或网络正常）";
    $("date").textContent = "—";
    return;
  }
  USDJPY = (DATA.fx || []).find(x => x.symbol === "JPY=X")?.price || USDJPY;
  $("date").textContent = (DATA.date_jp || "") + " · " + (DATA.generated_at || "");
  renderIndexes();
  renderFX();
  renderAI();
  renderWatch();
  renderPortfolio();
}

init();
