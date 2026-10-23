/* 全球市场参谋 v2 - 前端逻辑：搜索 / 走势图 / AI 预测 / 收藏 / 持仓 */
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? "—" : n.toFixed(d);
const sign = (v) => (v === null || v === undefined || isNaN(v)) ? "—" : (v > 0 ? "+" + v.toFixed(2) : v.toFixed(2));

let DATA = null;
let USDJPY = 155;
let chart = null;
let currentSymbol = null;
let currentRange = "1m";

function fmtJPY(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return "¥" + Math.round(n).toLocaleString();
}

function md(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function badge(r) {
  const cls = !r || r.level === "数据不足" ? "" :
    r.level === "低风险" ? "risk-low" : r.level === "中风险" ? "risk-mid" :
    r.level === "中高风险" ? "risk-midhigh" : "risk-high";
  const txt = r ? r.level : "—";
  return `<span class="risk-badge ${cls}">${txt}</span>`;
}

function findItem(symbol) {
  if (!DATA) return null;
  for (const k of ["indexes", "etfs", "stocks", "japan", "funds", "fx", "commodities"]) {
    const it = (DATA[k] || []).find(x => x.symbol === symbol);
    if (it) return it;
  }
  return (DATA.watch || []).find(x => x.symbol === symbol) || null;
}

/* ========== 今日概览 ========== */
function renderIndexes() {
  const grid = $("index-grid");
  grid.innerHTML = (DATA.indexes || []).map(it => {
    const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
    const arrow = it.chg1d_pct > 0 ? "▲" : it.chg1d_pct < 0 ? "▼" : "—";
    return `<div class="grid-card" data-s="${it.symbol}">
      <div class="nm">${it.name} <span style="opacity:.6">· ${it.region}</span></div>
      <div class="px">${fmt(it.price, 0)}</div>
      <div class="ch ${c}">${arrow} ${sign(it.chg1d_pct)}%</div>
      <div class="nm" style="margin-top:4px">${badge(it.risk)}</div>
    </div>`;
  }).join("");
  $("idx-time").textContent = DATA.generated_at ? "更新 " + DATA.generated_at : "";
  grid.querySelectorAll(".grid-card").forEach(c => c.onclick = () => openDetail(c.dataset.s));
}

function renderFX() {
  const grid = $("fx-grid");
  const items = [...(DATA.fx || []), ...(DATA.commodities || [])];
  grid.innerHTML = items.map(it => {
    const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
    return `<div class="grid-card" data-s="${it.symbol}">
      <div class="nm">${it.name}</div>
      <div class="px">${fmt(it.price)}</div>
      <div class="ch ${c}">${sign(it.chg1d_pct)}%</div>
    </div>`;
  }).join("");
  grid.querySelectorAll(".grid-card").forEach(c => c.onclick = () => openDetail(c.dataset.s));
}

function renderAI() {
  const ai = DATA.ai;
  if (!ai) { $("ai-text").textContent = "（AI 解读暂未生成）"; return; }
  let h = "";
  if (ai.environment) {
    h += `<div class="ai-env">${md(ai.environment)}</div>`;
  }
  if (ai.focus && ai.focus.length) {
    h += `<div class="ai-focus-title">🎯 今日关注</div>`;
    ai.focus.forEach(f => {
      const it = findItem(f.symbol);
      h += `<div class="ai-focus" data-s="${f.symbol}">
        <div class="ai-focus-head"><b>${f.name || f.symbol}</b> <span class="chg">${it ? sign(it.chg1d_pct) + "%" : ""}</span></div>
        <div class="hint">${md(f.why || "")}</div>
        <div class="hint" style="color:#f76b15">⚠ ${md(f.risk || "")}</div>
      </div>`;
    });
  }
  if (ai.advice) h += `<div class="ai-advice">💡 <b>操作思路</b><br>${md(ai.advice)}</div>`;
  if (ai.disclaimer) h += `<div class="hint ai-disc">${md(ai.disclaimer)}</div>`;
  $("ai-text").innerHTML = h || "（AI 解读暂未生成）";
  document.querySelectorAll(".ai-focus").forEach(el => el.onclick = () => openDetail(el.dataset.s));
}

/* ========== 关注列表 ========== */
function metricsHtml(it) {
  const m = [];
  if (it.rsi14 !== null && it.rsi14 !== undefined) m.push(`RSI <b>${fmt(it.rsi14, 0)}</b>`);
  if (it.vol20_annual_pct) m.push(`波动率 <b>${fmt(it.vol20_annual_pct, 0)}%</b>`);
  if (it.pct52w !== undefined) m.push(`52周位置 <b>${fmt(it.pct52w, 0)}%</b>`);
  if (it.pe) m.push(`PE <b>${fmt(it.pe, 1)}</b>`);
  if (it.trend === 2) m.push("趋势 <b>强势</b>");
  else if (it.trend === 0) m.push("趋势 <b>偏弱</b>");
  else m.push("趋势 <b>中性</b>");
  const p = it.prediction || {};
  const ai = p.ai || {};
  if (ai.direction) m.push(`AI预测 <b>${ai.direction}</b>${p.confidence ? " " + p.confidence + "%" : ""}`);
  return m.join('<span class="metric">·</span>');
}

function watchItem(it) {
  const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
  return `<div class="item" data-s="${it.symbol}">
    <div class="item-head">
      <div>
        <div class="item-name">${it.name} <span class="${c}">(${sign(it.chg1d_pct)}%)</span></div>
        <div class="item-sub">${it.symbol} · ${fmt(it.price)} ${it.region ? "· " + it.region : ""}</div>
      </div>
      ${badge(it.risk)}
    </div>
    <div class="item-metrics">${metricsHtml(it)}</div>
  </div>`;
}

function renderWatch() {
  const etfs = (DATA.etfs || []).slice().sort((a, b) => (a.risk.score || 99) - (b.risk.score || 99));
  const stocks = (DATA.stocks || []).slice().sort((a, b) => (a.risk.score || 99) - (b.risk.score || 99));
  const jps = (DATA.japan || []).slice().sort((a, b) => (a.risk.score || 99) - (b.risk.score || 99));
  $("etf-list").innerHTML = etfs.map(watchItem).join("") || '<div class="card tip">暂无数据</div>';
  $("stock-list").innerHTML = stocks.map(watchItem).join("") || '<div class="card tip">暂无数据</div>';
  $("jp-list").innerHTML = jps.map(watchItem).join("") || '<div class="card tip">暂无数据</div>';
  document.querySelectorAll("#etf-list .item, #stock-list .item, #jp-list .item").forEach(el => el.onclick = () => openDetail(el.dataset.s));
  renderFavs();
}

function getFavs() {
  try { return JSON.parse(localStorage.getItem("ma_favs") || "[]"); } catch { return []; }
}
function saveFavs(list) { localStorage.setItem("ma_favs", JSON.stringify(list)); }

function renderFavs() {
  const favs = getFavs();
  const items = favs.map(findItem).filter(Boolean);
  $("fav-list").innerHTML = items.map(watchItem).join("") || '<div class="card tip">还没有收藏。搜索任意全球标的，点 ☆ 收藏。</div>';
  document.querySelectorAll("#fav-list .item").forEach(el => el.onclick = () => openDetail(el.dataset.s));
}

/* ========== 搜索 ========== */
function bindSearch() {
  const input = $("search-input");
  const box = $("search-results");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.style.display = "none"; return; }
      if (!DATA || !DATA.search_index) return;
      const hits = DATA.search_index.filter(x =>
        x.symbol.toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q)
      ).slice(0, 30);
      if (!hits.length) { box.innerHTML = '<div class="sr-item muted">没有匹配的标的</div>'; box.style.display = "block"; return; }
      box.innerHTML = hits.map(x => `<div class="sr-item" data-s="${x.symbol}">
        <div class="sr-name">${x.name} <span class="sr-sym">${x.symbol}</span></div>
        <div class="sr-sub">${x.type || ""} ${x.region ? "· " + x.region : ""} ${x.price ? "· " + fmt(x.price) : ""} <span class="${x.chg1d_pct > 0 ? "up" : x.chg1d_pct < 0 ? "down" : ""}">${sign(x.chg1d_pct)}%</span></div>
      </div>`).join("");
      box.style.display = "block";
      box.querySelectorAll(".sr-item").forEach(el => el.onclick = () => {
        box.style.display = "none"; input.value = "";
        openDetail(el.dataset.s);
      });
    }, 150);
  });
  document.addEventListener("click", (e) => {
    if (!box.contains(e.target) && e.target !== input) box.style.display = "none";
  });
}

/* ========== 详情弹层 ========== */
function openDetail(symbol) {
  const it = findItem(symbol);
  if (!it) { toast("未找到 " + symbol); return; }
  currentSymbol = symbol;
  currentRange = "1m";
  $("m-title").textContent = it.name || it.symbol;
  $("m-sub").textContent = `${it.symbol} · ${it.type || typeOf(it)}${it.region ? " · " + it.region : ""}`;
  $("m-price").textContent = fmt(it.price, it.price > 10000 ? 0 : 2);
  const c = it.chg1d_pct > 0 ? "up" : it.chg1d_pct < 0 ? "down" : "flat";
  $("m-chg").textContent = `${sign(it.chg1d_pct)}%`;
  $("m-chg").className = "chg " + c;
  $("m-risk").outerHTML = `<span class="risk-badge ${it.risk ? (it.risk.level === "低风险" ? "risk-low" : it.risk.level === "中风险" ? "risk-mid" : it.risk.level === "中高风险" ? "risk-midhigh" : "risk-high") : ""}" id="m-risk">${it.risk ? it.risk.level : "—"}</span>`;
  const fav = getFavs().includes(symbol);
  $("m-fav").textContent = fav ? "★ 已收藏" : "☆ 收藏";
  $("m-fav").classList.toggle("fav-on", fav);
  $("m-updated").textContent = DATA.generated_at || "—";

  const p = it.prediction || {};
  const ai = p.ai || {};
  $("m-dir").textContent = ai.direction || p.direction || "—";
  $("m-dir").className = "pred-dir " + dirClass(ai.direction || p.direction);
  $("m-conf").textContent = p.confidence !== null && p.confidence !== undefined ? p.confidence + "%" : "—";
  const d10 = (p.horizons || {}).d10 || {};
  $("m-center").textContent = fmt(d10.center);
  $("m-support").textContent = fmt(ai.support);
  $("m-resistance").textContent = fmt(ai.resistance);
  $("m-why").textContent = ai.rationale || "（该标的暂无 AI 深度预测，显示统计区间）";
  $("m-note").textContent = "预测模型：" + (p.model || "统计区间") + " · AI 预测为概率性判断，不构成投资建议。";
  $("m-ind").innerHTML = indGrid(it);
  $("modal-mask").style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => drawChart(it), 60);
}

function typeOf(it) {
  if (it.symbol.endsWith("=X")) return "汇率";
  if (it.symbol.endsWith("=F")) return "商品";
  if (it.symbol.endsWith(".T")) return "日股";
  if (it.symbol.startsWith("^")) return "指数";
  return "标的";
}

function dirClass(d) {
  if (d === "偏多") return "dir-up";
  if (d === "偏空") return "dir-down";
  return "dir-flat";
}

function indGrid(it) {
  const cells = [
    ["RSI(14)", fmt(it.rsi14, 0)],
    ["年化波动率", it.vol20_annual_pct ? fmt(it.vol20_annual_pct, 0) + "%" : "—"],
    ["MA20", fmt(it.ma20)],
    ["MA50", fmt(it.ma50)],
    ["MA200", it.ma200 ? fmt(it.ma200) : "—"],
    ["52周最高", fmt(it.high52)],
    ["52周最低", fmt(it.low52)],
    ["52周位置", it.pct52w !== undefined ? fmt(it.pct52w, 0) + "%" : "—"],
    ["一周涨跌", sign(it.chg1w_pct) + "%"],
    ["趋势", it.trend === 2 ? "强势" : it.trend === 0 ? "偏弱" : "中性"],
  ];
  if (it.pe) cells.push(["PE", fmt(it.pe, 1)]);
  if (it.pb) cells.push(["PB", fmt(it.pb, 2)]);
  if (it.divYield) cells.push(["股息率", (it.divYield * 100).toFixed(2) + "%"]);
  return cells.map(x => `<div class="ind-cell"><div class="ind-label">${x[0]}</div><div class="ind-val">${x[1]}</div></div>`).join("");
}

function drawChart(it) {
  const hist = it.history || [];
  const box = $("m-chart");
  if (!box || !window.echarts) return;
  if (chart) { chart.dispose(); chart = null; }
  chart = echarts.init(box, null, { renderer: "canvas" });
  if (!hist.length) {
    chart.setOption({
      title: { text: "暂无历史数据（快照标的仅当日行情）", left: "center", top: "middle", textStyle: { color: "#888", fontSize: 12 } },
      backgroundColor: "transparent",
    });
    return;
  }
  const ranges = { "1m": 20, "3m": 60, "6m": 125, "1y": 250 };
  const n = ranges[currentRange] || 250;
  const slice = hist.slice(-n);
  const dates = slice.map(x => x[0]);
  const closes = slice.map(x => x[1]);
  const lastDate = dates[dates.length - 1];
  const lastClose = closes[closes.length - 1];

  // 预测点（未来 5/10/20 交易日 ≈ 7/14/28 日历日）
  const p = it.prediction || {};
  const h = p.horizons || {};
  const mkDate = (dd) => {
    const dt = new Date(lastDate + "T00:00:00");
    dt.setDate(dt.getDate() + dd);
    return dt.toISOString().slice(0, 10);
  };
  const f5 = mkDate(7), f10 = mkDate(14), f20 = mkDate(28);
  const centerLine = [[f5, h.d5 ? h.d5.center : null], [f10, h.d10 ? h.d10.center : null], [f20, h.d20 ? h.d20.center : null]];
  const upLine = [[f5, h.d5 ? h.d5.up : null], [f10, h.d10 ? h.d10.up : null], [f20, h.d20 ? h.d20.up : null]];
  const downLine = [[f5, h.d5 ? h.d5.down : null], [f10, h.d10 ? h.d10.down : null], [f20, h.d20 ? h.d20.down : null]];

  const series = [{
    name: "收盘价", type: "line", data: closes, showSymbol: false,
    lineStyle: { width: 2, color: "#4c9aff" }, itemStyle: { color: "#4c9aff" },
    areaStyle: { color: "rgba(76,154,255,.12)" },
    markLine: {
      symbol: "none", label: { fontSize: 9, color: "#aaa" },
      data: it.ma20 ? [{ name: "MA20", yAxis: it.ma20, lineStyle: { color: "#f5a623", type: "dashed", width: 1 } }] : [],
    },
  }];
  if (h.d5) {
    series.push(
      { name: "预测中枢", type: "line", data: centerLine, showSymbol: true, symbolSize: 6, lineStyle: { color: "#f76b15", type: "dashed", width: 2 }, itemStyle: { color: "#f76b15" }, connectNulls: true },
      { name: "预测上沿", type: "line", data: upLine, showSymbol: false, lineStyle: { color: "#f76b15", type: "dotted", width: 1, opacity: .6 }, itemStyle: { color: "#f76b15" }, connectNulls: true },
      { name: "预测下沿", type: "line", data: downLine, showSymbol: false, lineStyle: { color: "#f76b15", type: "dotted", width: 1, opacity: .6 }, itemStyle: { color: "#f76b15" }, connectNulls: true }
    );
  }
  chart.setOption({
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 8, right: 8, top: 18, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1b2030", borderColor: "#333", textStyle: { color: "#eee", fontSize: 11 },
      formatter: (params) => {
        let s = params[0].name;
        params.forEach(x => { if (x.value != null) s += `<br>${x.seriesName}: <b>${fmt(x.value)}</b>`; });
        return s;
      },
    },
    xAxis: { type: "category", data: dates.concat([f5, f10, f20]), axisLabel: { color: "#888", fontSize: 9 }, axisLine: { lineStyle: { color: "#333" } }, splitLine: { show: false } },
    yAxis: { type: "value", scale: true, axisLabel: { color: "#888", fontSize: 9 }, splitLine: { lineStyle: { color: "#222" } } },
    series: series,
  });
  box.style.height = "280px";
  chart.resize();
}

function closeDetail() {
  $("modal-mask").style.display = "none";
  document.body.style.overflow = "";
  if (chart) { chart.dispose(); chart = null; }
}

/* ========== 持仓图片 AI 识别导入 ========== */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const OCR_PROMPT = "这是日本SBI证券的持仓画面截图。请识别表格内容，输出JSON数组，每项字段: name(銘柄名), code(4位コード), qty(数量/口数原文), qty_num(纯数字), cost(取得単価纯数字), amount(評価金額纯数字如512340), total(评估金额合计纯数字)。只输出JSON，不要其他文字。";
let imgRows = [];

function getGeminiKey() {
  try { return (localStorage.getItem("ma_gemini_key") || "").trim(); } catch { return ""; }
}

async function geminiVision(dataUrl) {
  const key = getGeminiKey();
  if (!key) throw new Error("请先在「设置」页填写 Gemini API Key");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [{ role: "user", content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } }
        ] }],
        temperature: 0.1, max_tokens: 1024,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "识别超时，请重试" : "识别失败：" + e.message);
  } finally {
    clearTimeout(timer);
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("读取文件失败"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片无法解析"));
      img.onload = () => {
        // 压缩到最长边 1600，控制请求体积
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.92));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function parseImgResult(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("["), end = t.lastIndexOf("]");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const arr = JSON.parse(t);
  if (!Array.isArray(arr)) throw new Error("识别结果格式异常");
  return arr.filter(r => r && (r.name || r.code)).map(r => ({
    name: String(r.name || "").trim(),
    code: String(r.code || "").trim(),
    qty: r.qty_num !== undefined && r.qty_num !== null ? String(r.qty_num) : (String(r.qty || "").replace(/[^0-9.]/g, "")),
    cost: r.cost !== undefined && r.cost !== null ? String(r.cost) : "",
    amount: r.amount !== undefined && r.amount !== null ? String(r.amount) : "",
  }));
}

function showImgStatus(html, ok) {
  const el = $("img-status");
  el.style.display = "block";
  el.innerHTML = html;
  el.className = "img-status " + (ok ? "ok" : "err");
}

function renderImgRows() {
  const box = $("img-rows");
  if (!imgRows.length) { box.innerHTML = '<div class="tip">没有识别到持仓条目，换张清晰截图试试。</div>'; return; }
  let total = 0;
  box.innerHTML = imgRows.map((r, i) => {
    const amt = parseFloat(r.amount);
    if (!isNaN(amt)) total += amt;
    return `<div class="ir-row" data-i="${i}">
      <label class="ir-check"><input type="checkbox" checked data-i="${i}" /> <span>${i + 1}</span></label>
      <div class="ir-fields">
        <input class="ir-name" value="${r.name}" placeholder="名称" data-i="${i}" />
        <input class="ir-code" value="${r.code}" placeholder="代码" data-i="${i}" />
        <div class="ir-nums">
          <input class="ir-qty" value="${r.qty}" placeholder="数量" inputmode="decimal" data-i="${i}" />
          <input class="ir-cost" value="${r.cost}" placeholder="取得単価" inputmode="decimal" data-i="${i}" />
          <input class="ir-amount" value="${r.amount}" placeholder="評価金額" inputmode="decimal" data-i="${i}" />
        </div>
      </div>
    </div>`;
  }).join("");
  $("img-total").innerHTML = "共识别 <b>" + imgRows.length + "</b> 条，评估金额合计 <b>¥" + Math.round(total).toLocaleString() + "</b>（请与截图合计核对）";
  // 绑定编辑
  box.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i, f = imgRows[i];
      if (!f) return;
      if (inp.classList.contains("ir-name")) f.name = inp.value;
      else if (inp.classList.contains("ir-code")) f.code = inp.value;
      else if (inp.classList.contains("ir-qty")) f.qty = inp.value;
      else if (inp.classList.contains("ir-cost")) f.cost = inp.value;
      else if (inp.classList.contains("ir-amount")) f.amount = inp.value;
    });
  });
  box.querySelectorAll(".ir-check input").forEach(cb => cb.addEventListener("change", () => {
    const i = +cb.dataset.i;
    cb.closest(".ir-row").classList.toggle("off", !cb.checked);
  }));
}

async function handleImageFile(file) {
  $("img-result").style.display = "none";
  showImgStatus("⏳ 正在读取图片…", true);
  let dataUrl;
  try { dataUrl = await readImageFile(file); } catch (e) { showImgStatus("⚠ " + e.message, false); return; }
  showImgStatus("🤖 AI 正在识别持仓…（约 5-15 秒）", true);
  try {
    const text = await geminiVision(dataUrl);
    imgRows = parseImgResult(text);
    $("img-status").style.display = "none";
    $("img-result").style.display = "block";
    renderImgRows();
  } catch (e) {
    showImgStatus("⚠ " + e.message, false);
  }
}

function confirmImgImport() {
  const picked = [];
  document.querySelectorAll("#img-rows .ir-row").forEach(row => {
    const cb = row.querySelector(".ir-check input");
    if (cb && cb.checked) {
      const i = +row.dataset.i, r = imgRows[i];
      const qty = parseFloat(r.qty);
      if (!r.code || isNaN(qty) || qty <= 0) return;
      picked.push({
        code: r.code.replace(/\D/g, "").slice(0, 6) || r.code,
        qty: qty,
        cost: r.cost !== "" && !isNaN(parseFloat(r.cost)) ? parseFloat(r.cost) : null,
        name: r.name,
        amount: r.amount !== "" && !isNaN(parseFloat(r.amount)) ? parseFloat(r.amount) : null,
      });
    }
  });
  if (!picked.length) { toast("没有可导入的有效条目（需有代码和数量）"); return; }
  const list = getPortfolio();
  // 同代码合并数量与市值
  picked.forEach(p => {
    const ex = list.find(x => x.code === p.code);
    if (ex) {
      ex.qty += p.qty;
      if (p.cost) ex.cost = ex.cost ? Math.round((ex.cost + p.cost) / 2) : p.cost;
      if (p.amount) ex.amount = (ex.amount || 0) + p.amount;
      if (p.name && !ex.name) ex.name = p.name;
    } else {
      list.push(p);
    }
  });
  savePortfolio(list);
  imgRows = [];
  $("img-result").style.display = "none";
  $("img-status").style.display = "none";
  $("p-img").value = "";
  renderPortfolio();
  toast("已导入 " + picked.length + " 条持仓");
}

/* ========== 持仓 ========== */
function getPortfolio() {
  try { return JSON.parse(localStorage.getItem("ma_portfolio") || "[]"); } catch { return []; }
}
function savePortfolio(list) { localStorage.setItem("ma_portfolio", JSON.stringify(list)); }

function renderPortfolio() {
  const list = getPortfolio();
  const box = $("portfolio-list");
  const sum = $("portfolio-summary");
  if (!list.length) { box.innerHTML = '<div class="card tip">还没有持仓，拍照导入或添加一个吧。</div>'; sum.style.display = "none"; return; }
  const pool = {};
  [...(DATA.etfs || []), ...(DATA.stocks || []), ...(DATA.japan || []), ...(DATA.funds || [])].forEach(x => pool[x.symbol] = x);
  const norm = s => (s || "").toLowerCase().replace(/[\s（）()　・･．.、]/g, "");
  let totalVal = 0, totalCost = 0;
  const rows = list.map((h, i) => {
    let it = pool[h.code];
    if (!it && h.name) {
      const hn = norm(h.name);
      for (const k in pool) {
        const pn = norm(pool[k].name || "");
        if (pn && (pn === hn || (hn.length >= 6 && pn.includes(hn)) || (pn.length >= 6 && hn.includes(pn)))) { it = pool[k]; break; }
      }
    }
    let price, currency = "JPY", risk = null, extra = "";
    if (it) {
      price = it.price;
      currency = (it.region === "US" || it.region === "Global" || it.region === "EM" || it.region === "Gold" || it.region === "Bond" || it.region === "Silver" || it.region === "CN" || it.region === "BR") ? "USD" : "JPY";
      risk = it.risk;
      extra = `<div class="sub">${it.name} · 风险 ${risk ? risk.level : "—"}</div>`;
    } else {
      extra = h.name ? `<div class="sub">${h.name} · 未在追踪池（仅记录，不诊断）</div>` : `<div class="sub">未在追踪池（仅记录，不诊断）</div>`;
    }
    // 优先用识别到的评估金额（日元）；否则按池内价格估算
    let val = h.amount && !isNaN(h.amount) ? h.amount : (price ? (currency === "USD" ? price * h.qty * USDJPY : price * h.qty) : 0);
    const costVal = h.cost ? (currency === "USD" ? h.cost * h.qty * USDJPY : h.cost * h.qty) : null;
    totalVal += val;
    if (costVal) totalCost += costVal;
    const pnl = costVal ? val - costVal : null;
    const title = h.name || it?.name || h.code;
    return `<div class="port-row${it ? " port-ok" : ""}"${it ? ` data-s="${it.symbol}"` : ""}>
      <div>
        <div class="nm">${title} <span class="sub">× ${h.qty}</span></div>
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
  box.querySelectorAll("[data-s]").forEach(el => el.onclick = () => openDetail(el.dataset.s));
  document.querySelectorAll(".del").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const list2 = getPortfolio(); list2.splice(+b.dataset.i, 1); savePortfolio(list2); renderPortfolio();
  });
  sum.style.display = "block";
  const pct = totalCost ? ((totalVal - totalCost) / totalCost * 100) : null;
  sum.innerHTML = `<div class="card-title">持仓汇总</div>
    <div class="row"><span>估算市值</span><b>${fmtJPY(totalVal)}</b></div>
    <div class="row"><span>估算盈亏</span><b class="${pct !== null ? (pct >= 0 ? 'up' : 'down') : ''}">${pct !== null ? sign(pct) + "%" : "—"}</b></div>
    <div class="hint">注：识别导入的持仓按截图时的评估金额记录；池内标的按今日收盘价估算，美股按 USD/JPY（${fmt(USDJPY)}）换算。</div>`;
}

function parseCSV(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim());
  if (!rows.length) return { ok: false, msg: "内容为空" };
  const header = rows[0].split(/[,，\t]/).map(s => s.trim());
  const codeIdx = header.findIndex(h => /コード|code/i.test(h));
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
    if (codeIdx < 0 && nameIdx >= 0) code = cells[nameIdx];
    const qty = qtyIdx >= 0 ? parseFloat(cells[qtyIdx].replace(/[^0-9.\-]/g, "")) : 0;
    const cost = costIdx >= 0 ? parseFloat(cells[costIdx].replace(/[^0-9.\-]/g, "")) : null;
    if (!code || isNaN(qty) || qty <= 0) continue;
    list.push({ code, qty, cost });
    added++;
  }
  savePortfolio(list);
  return { ok: true, msg: "导入 " + added + " 条" };
}

/* ========== 设置 ========== */
function loadSettings() {
  const s = JSON.parse(localStorage.getItem("ma_settings") || "{}");
  if (s.risk) $("s-risk").value = s.risk;
  const k = getGeminiKey();
  if (k) $("s-gemini").value = k;
}
function saveSettings() {
  localStorage.setItem("ma_settings", JSON.stringify({ risk: $("s-risk").value }));
  localStorage.setItem("ma_gemini_key", $("s-gemini").value.trim());
  $("s-status").textContent = "已保存（风险偏好用于排序提示；Key 已存本机）";
}

function toast(msg) {
  const bar = $("status-bar");
  bar.textContent = msg; bar.classList.add("show");
  setTimeout(() => bar.classList.remove("show"), 2600);
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    $("tab-" + t.dataset.tab).classList.add("active");
  });
}

/* ========== 启动 ========== */
async function init() {
  bindTabs();
  bindSearch();
  loadSettings();

  $("m-close").onclick = closeDetail;
  $("modal-mask").onclick = (e) => { if (e.target === $("modal-mask")) closeDetail(); };
  $("m-fav").onclick = () => {
    if (!currentSymbol) return;
    const favs = getFavs();
    const i = favs.indexOf(currentSymbol);
    if (i >= 0) favs.splice(i, 1); else favs.push(currentSymbol);
    saveFavs(favs);
    const on = favs.includes(currentSymbol);
    $("m-fav").textContent = on ? "★ 已收藏" : "☆ 收藏";
    $("m-fav").classList.toggle("fav-on", on);
    renderFavs();
    toast(on ? "已收藏" : "已取消收藏");
  };
  document.querySelectorAll("#m-range .rng").forEach(b => b.onclick = () => {
    document.querySelectorAll("#m-range .rng").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    currentRange = b.dataset.r;
    const it = findItem(currentSymbol);
    if (it) drawChart(it);
  });

  $("p-add").onclick = () => {
    const c = $("p-code").value, q = $("p-qty").value, cst = $("p-cost").value;
    if (!c || !q) { toast("请输入代码和数量"); return; }
    const list = getPortfolio();
    list.push({ code: c.trim().toUpperCase(), qty: parseFloat(q) || 0, cost: cst ? parseFloat(cst) : null });
    savePortfolio(list);
    $("p-code").value = ""; $("p-qty").value = ""; $("p-cost").value = "";
    renderPortfolio();
    toast("已添加");
  };
  $("p-import").onclick = () => {
    const r = parseCSV($("p-csv").value);
    $("p-csv").value = "";
    toast(r.msg);
    renderPortfolio();
  };
  $("p-img-btn").onclick = () => $("p-img").click();
  $("p-img").onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleImageFile(f);
  };
  $("img-confirm").onclick = confirmImgImport;
  $("s-save").onclick = () => { saveSettings(); toast("设置已保存"); };
  $("etf-toggle").onclick = (e) => {
    const listEl = $("etf-list");
    listEl.classList.toggle("collapsed");
    e.target.textContent = listEl.classList.contains("collapsed") ? "显示全部 25 个 ▾" : "收起 ▴";
  };

  try {
    const res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
  } catch (e) {
    $("ai-text").textContent = "数据加载失败：" + e.message;
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
