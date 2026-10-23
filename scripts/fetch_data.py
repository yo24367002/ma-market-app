# -*- coding: utf-8 -*-
"""
fetch_data.py v2 - 全球市场数据管道
- 精选池 (~70): 完整250日历史 + 技术指标 + 风险评分 + 统计预测
- 快照池 (~300): 当日行情 + 近10日迷你走势 (供搜索与关注)
- 搜索索引: 合并两池, 供前端即时搜索
用于 GitHub Actions 每日定时 + 本地测试
"""
import json
import math
import datetime
import traceback

try:
    import yfinance as yf
except ImportError:
    yf = None

# ================= 精选池 (FULL) =================
INDEXES = [
    {"symbol": "^GSPC", "name": "S&P 500", "region": "US"},
    {"symbol": "^DJI", "name": "道琼斯", "region": "US"},
    {"symbol": "^IXIC", "name": "纳斯达克", "region": "US"},
    {"symbol": "^N225", "name": "日经225", "region": "JP"},
    {"symbol": "^HSI", "name": "恒生指数", "region": "HK"},
    {"symbol": "^KS11", "name": "KOSPI", "region": "KR"},
    {"symbol": "^AXJO", "name": "ASX200", "region": "AU"},
    {"symbol": "^STI", "name": "海峡时报STI", "region": "SG"},
    {"symbol": "^FTSE", "name": "英国富时100", "region": "UK"},
    {"symbol": "^GDAXI", "name": "德国DAX", "region": "DE"},
    {"symbol": "^FCHI", "name": "法国CAC40", "region": "FR"},
    {"symbol": "^BSESN", "name": "印度SENSEX", "region": "IN"},
]

ETFS = [
    {"symbol": "SPY", "name": "S&P 500 ETF", "region": "US"},
    {"symbol": "QQQ", "name": "纳斯达克100 ETF", "region": "US"},
    {"symbol": "VTI", "name": "全美股 ETF", "region": "US"},
    {"symbol": "VOO", "name": "S&P500 Vanguard ETF", "region": "US"},
    {"symbol": "VXUS", "name": "全球除美 ETF", "region": "Global"},
    {"symbol": "VEA", "name": "发达市场除美 ETF", "region": "Global"},
    {"symbol": "EEM", "name": "新兴市场 ETF", "region": "EM"},
    {"symbol": "IWM", "name": "美股小盘 ETF", "region": "US"},
    {"symbol": "EWJ", "name": "日本股 ETF", "region": "JP"},
    {"symbol": "SCHD", "name": "美股高股息 ETF", "region": "US"},
    {"symbol": "VYM", "name": "美股高股息 VYM", "region": "US"},
    {"symbol": "VNQ", "name": "美股REIT ETF", "region": "US"},
    {"symbol": "XLK", "name": "科技板块 ETF", "region": "US"},
    {"symbol": "XLF", "name": "金融板块 ETF", "region": "US"},
    {"symbol": "XLV", "name": "医疗保健 ETF", "region": "US"},
    {"symbol": "GLD", "name": "黄金 ETF", "region": "Gold"},
    {"symbol": "SLV", "name": "白银 ETF", "region": "Silver"},
    {"symbol": "TLT", "name": "美国长期债 ETF", "region": "Bond"},
    {"symbol": "BND", "name": "美国综合债 ETF", "region": "Bond"},
    {"symbol": "HYG", "name": "高收益债 ETF", "region": "Bond"},
    {"symbol": "IEF", "name": "美国中期债 ETF", "region": "Bond"},
    {"symbol": "FXI", "name": "中国大盘 ETF", "region": "CN"},
    {"symbol": "KWEB", "name": "中国互联网 ETF", "region": "CN"},
    {"symbol": "EWZ", "name": "巴西 ETF", "region": "BR"},
    {"symbol": "ARKK", "name": "ARK创新 ETF", "region": "US"},
]

STOCKS = [
    {"symbol": "AAPL", "name": "苹果", "region": "US"},
    {"symbol": "MSFT", "name": "微软", "region": "US"},
    {"symbol": "NVDA", "name": "英伟达", "region": "US"},
    {"symbol": "GOOGL", "name": "谷歌A", "region": "US"},
    {"symbol": "AMZN", "name": "亚马逊", "region": "US"},
    {"symbol": "TSLA", "name": "特斯拉", "region": "US"},
    {"symbol": "META", "name": "Meta", "region": "US"},
    {"symbol": "JPM", "name": "摩根大通", "region": "US"},
    {"symbol": "XOM", "name": "埃克森美孚", "region": "US"},
    {"symbol": "AMD", "name": "超威半导体", "region": "US"},
    {"symbol": "NFLX", "name": "奈飞", "region": "US"},
    {"symbol": "AVGO", "name": "博通", "region": "US"},
    {"symbol": "ORCL", "name": "甲骨文", "region": "US"},
    {"symbol": "CRM", "name": "Salesforce", "region": "US"},
    {"symbol": "COST", "name": "好市多", "region": "US"},
]

JAPAN = [
    {"symbol": "7203.T", "name": "丰田汽车", "region": "JP"},
    {"symbol": "6758.T", "name": "索尼集团", "region": "JP"},
    {"symbol": "9984.T", "name": "软银集团", "region": "JP"},
    {"symbol": "8035.T", "name": "东京电子", "region": "JP"},
    {"symbol": "6861.T", "name": "基恩士", "region": "JP"},
    {"symbol": "9983.T", "name": "迅销", "region": "JP"},
    {"symbol": "4063.T", "name": "信越化学", "region": "JP"},
    {"symbol": "6098.T", "name": "瑞可利控股", "region": "JP"},
    {"symbol": "6367.T", "name": "大金工业", "region": "JP"},
    {"symbol": "6501.T", "name": "日立制作所", "region": "JP"},
]

FX = [
    {"symbol": "JPY=X", "name": "美元/日元"},
    {"symbol": "EURJPY=X", "name": "欧元/日元"},
    {"symbol": "GBPJPY=X", "name": "英镑/日元"},
    {"symbol": "AUDJPY=X", "name": "澳元/日元"},
    {"symbol": "CHFJPY=X", "name": "瑞郎/日元"},
]

COMMODITIES = [
    {"symbol": "GC=F", "name": "黄金期货", "unit": "美元/盎司"},
    {"symbol": "CL=F", "name": "WTI原油", "unit": "美元/桶"},
    {"symbol": "SI=F", "name": "白银期货", "unit": "美元/盎司"},
]

# ================= 快照池 (SNAP ~300) =================
SNAP_ETF = [
    "VGT", "SMH", "SOXX", "QTEC", "BOTZ", "AIQ", "IRBO", "ROBO", "TQQQ", "SQQQ",
    "SOXL", "LABU", "ICLN", "PBW", "TAN", "XLE", "XLI", "XLY", "XLP", "XLU",
    "XLC", "XLRE", "XBI", "XHB", "ITB", "XRT", "VIG", "DGRO", "SPYD", "DVY",
    "HDV", "NOBL", "USMV", "MTUM", "QUAL", "VLUE", "SIZE", "IYR", "SCHH",
    "BIL", "SHY", "AGG", "MUB", "TIP", "VTIP", "GOVT", "EDV", "ZROZ", "LQD",
    "MCHI", "EWG", "EWL", "EWP", "EWT", "EWU", "EWS", "EWY", "EWW", "SCHE",
    "IEMG", "IEFA", "SCZ", "VSS", "GDX", "GDXJ", "IAU", "DBA", "USO", "UNG",
    "XOP", "PPLT", "PALL", "COPX", "LIT", "REMX", "URA", "XME", "PICK", "WOOD",
    "CUT", "MOO", "PAVE", "HACK", "CIBR", "QQQJ", "MAGS", "SPLG", "ITOT", "IXUS",
    "AVUV", "AVDV", "AVUS", "FNDX", "FNDA", "VT", "ACWI", "GXUS", "SPTM", "VCR",
    "VDC", "VIS", "VDE", "VHT", "VPU", "VWO", "EEMV", "EWY", "JPXN", "HEFA",
    "HEWJ", "DXJ", "EWJ", "VPL", "AIA", "GXC", "FLCH", "EIDO", "EPP", "ASEA",
    "VNQI", "RWX", "O", "STAG", "WPC", "PLD", "AMT", "EQIX", "DLR", "AVB",
]
SNAP_STOCK = [
    "UBER", "SHOP", "PYPL", "DIS", "NKE", "BA", "GM", "F", "INTC", "CSCO",
    "QCOM", "TXN", "IBM", "MU", "AMAT", "LRCX", "KLAC", "ASML", "ARM", "PLTR",
    "SNOW", "DDOG", "CRWD", "PANW", "ZS", "NET", "SQ", "ABNB", "RBLX", "SNAP",
    "PINS", "SPOT", "U", "DKNG", "CCL", "RCL", "DAL", "UAL", "WMT", "TGT",
    "HD", "LOW", "MCD", "SBUX", "KO", "PEP", "PG", "JNJ", "PFE", "MRK",
    "ABBV", "LLY", "UNH", "CVS", "TMO", "DHR", "ABT", "MDT", "SYX", "BSX",
    "GE", "CAT", "DE", "HON", "MMM", "LMT", "RTX", "NOC", "GD", "V",
    "MA", "AXP", "GS", "MS", "BAC", "WFC", "C", "SCHW", "BLK", "BRK-B",
    "COIN", "HOOD", "MSTR", "TSM", "BABA", "PDD", "JD", "BIDU", "NIO", "LI",
    "TME", "BILI", "NTES", "XPEV", "TCEHY", "RIVN", "LCID", "BROS", "MRNA", "GILD",
    "AMGN", "BIIB", "REGN", "VRTX", "ISRG", "EW", "BSX", "SYK", "DXCM", "ZBH",
    "CARR", "OTIS", "PH", "EMR", "ROK", "AME", "ETN", "APH", "TEL", "JCI",
    "TT", "DOV", "SWK", "XYL", "WAB", "GWW", "FAST", "CTAS", "EFX", "ROL",
]
SNAP_JP = [
    "1321.T", "1306.T", "1557.T", "1570.T", "2515.T", "2569.T", "2630.T",
    "7203.T", "6758.T", "9984.T", "8035.T", "6861.T", "9983.T", "4063.T",
    "6098.T", "6367.T", "6501.T", "6981.T", "6902.T", "7267.T", "8031.T",
    "8001.T", "8306.T", "8316.T", "8411.T", "7974.T", "9432.T", "9433.T",
    "9613.T", "4568.T", "4502.T", "4519.T", "4523.T", "4755.T", "4689.T",
    "4704.T", "4385.T", "4324.T", "6178.T", "6146.T", "6326.T", "6273.T",
    "6383.T", "6702.T", "6723.T", "6770.T", "6857.T", "6920.T", "6954.T",
    "7741.T", "7762.T", "7911.T", "7936.T", "8267.T", "8604.T", "8766.T",
    "8801.T", "8802.T", "8830.T", "9020.T", "9022.T", "9101.T", "9104.T",
    "9202.T", "9501.T", "9531.T", "9532.T", "9719.T", "9735.T", "9766.T",
    "8058.T", "9831.T", "9843.T", "9531.T", "8591.T", "8707.T", "9303.T",
]
SNAP_HK = [
    "0700.HK", "9988.HK", "3690.HK", "1810.HK", "9618.HK", "2318.HK",
    "1299.HK", "0388.HK", "0005.HK", "0939.HK", "1398.HK", "3988.HK",
    "2628.HK", "2318.HK", "2018.HK", "1024.HK", "9961.HK", "9888.HK",
    "6862.HK", "6618.HK", "6060.HK", "9633.HK", "9923.HK", "1177.HK",
]

# ================= 指标计算 =================
def rsi(series, period=14):
    if len(series) < period + 1:
        return None
    deltas = [series[i] - series[i - 1] for i in range(1, len(series))]
    gains = [d if d > 0 else 0.0 for d in deltas]
    losses = [-d if d < 0 else 0.0 for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))

def ma(series, n):
    if len(series) < n:
        return None
    return sum(series[-n:]) / n

def annual_vol(series, period=20):
    if len(series) < period + 1:
        return None
    rets = [(series[i] / series[i - 1]) - 1 for i in range(len(series) - period, len(series))]
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / len(rets)
    return math.sqrt(var) * math.sqrt(252) * 100

def risk_score(item):
    """0-100 风险分。权重: 波动率35% 趋势25% RSI极端20% 52周位置20%"""
    if item is None or item.get("vol20_annual_pct") is None:
        return {"score": None, "level": "数据不足", "color": "#999"}
    vol = item["vol20_annual_pct"]
    trend = item["trend"]
    r = item.get("rsi14") or 50
    pct52 = item.get("pct52w") or 50
    s_vol = min(vol / 40.0, 1.0) * 35
    s_trend = (2 - trend) * 12.5
    s_rsi = 0.0
    if r >= 80: s_rsi = 20.0
    elif r >= 70: s_rsi = 13.0
    elif r <= 20: s_rsi = 15.0
    elif r <= 30: s_rsi = 8.0
    else: s_rsi = 4.0
    s_pos = 0.0
    if pct52 >= 90: s_pos = 20.0
    elif pct52 >= 75: s_pos = 12.0
    elif pct52 >= 40: s_pos = 5.0
    elif pct52 >= 15: s_pos = 10.0
    else: s_pos = 16.0
    total = round(s_vol + s_trend + s_rsi + s_pos, 1)
    if total >= 65: level, color = "高风险", "#e5484d"
    elif total >= 45: level, color = "中高风险", "#f76b15"
    elif total >= 28: level, color = "中风险", "#f5a623"
    else: level, color = "低风险", "#30a46c"
    return {"score": total, "level": level, "color": color}

def stat_prediction(closes):
    """统计预测: 基于近60日对数收益, 预测未来5/10/20日中枢与区间"""
    if not closes or len(closes) < 30:
        return None
    win = closes[-60:]
    rets = [math.log(win[i] / win[i - 1]) for i in range(1, len(win))]
    mu = sum(rets) / len(rets)
    var = sum((r - mu) ** 2 for r in rets) / len(rets)
    sigma = math.sqrt(var)
    last = closes[-1]
    if mu > 0.0008: direction = "偏多"
    elif mu < -0.0008: direction = "偏空"
    else: direction = "震荡"
    h5, h10, h20 = 5, 10, 20
    def band(h):
        c = last * math.exp(mu * h)
        s = sigma * math.sqrt(h)
        return {"center": round(c, 2), "up": round(c * math.exp(s), 2), "down": round(c * math.exp(-s), 2)}
    p = {
        "direction": direction,
        "horizons": {"d5": band(h5), "d10": band(h10), "d20": band(h20)},
        "model": "近60日对数收益均值漂移 + 波动率区间 (68%置信)",
        "confidence": None, "ai": None,
    }
    return p

def analyze_history(hist, symbol):
    if hist is None or hist.empty:
        return None
    df = hist.dropna(subset=["Close"])
    if df.empty:
        return None
    closes = [float(v) for v in df["Close"].tolist()]
    dates = [str(d)[:10] for d in df.index.tolist()]
    if len(closes) < 30:
        return None
    last = closes[-1]
    prev_day = closes[-2] if len(closes) > 1 else last
    prev_week = closes[-6] if len(closes) > 5 else closes[0]
    high_52 = max(closes); low_52 = min(closes)
    pct52 = (last - low_52) / (high_52 - low_52) * 100 if high_52 != low_52 else 50.0
    r = rsi(closes)
    ma20 = ma(closes, 20); ma50 = ma(closes, 50); ma200 = ma(closes, 200)
    trend = 1
    if ma20 and ma50:
        if last > ma20 > ma50: trend = 2
        elif last < ma20 < ma50: trend = 0
    hist_series = [[d, round(c, 2)] for d, c in zip(dates[-250:], closes[-250:])]
    return {
        "symbol": symbol,
        "price": round(last, 2),
        "chg1d_pct": round((last / prev_day - 1) * 100, 2) if prev_day else None,
        "chg1w_pct": round((last / prev_week - 1) * 100, 2) if prev_week else None,
        "rsi14": round(r, 1) if r is not None else None,
        "ma20": round(ma20, 2) if ma20 else None,
        "ma50": round(ma50, 2) if ma50 else None,
        "ma200": round(ma200, 2) if ma200 else None,
        "vol20_annual_pct": round(annual_vol(closes), 1) if annual_vol(closes) else None,
        "pct52w": round(pct52, 1),
        "high52": round(high_52, 2),
        "low52": round(low_52, 2),
        "trend": trend,
        "history": hist_series,
    }

def analyze_snap(hist, symbol):
    """快照池: 当日价 + 近10日迷你走势"""
    if hist is None or hist.empty:
        return None
    df = hist.dropna(subset=["Close"])
    if df.empty:
        return None
    closes = [float(v) for v in df["Close"].tolist()]
    dates = [str(d)[:10] for d in df.index.tolist()]
    if not closes:
        return None
    last = closes[-1]
    prev = closes[-2] if len(closes) > 1 else last
    chg = round((last / prev - 1) * 100, 2) if prev else None
    spark = [[d, round(c, 2)] for d, c in zip(dates[-10:], closes[-10:])]
    return {"symbol": symbol, "price": round(last, 2), "chg1d_pct": chg, "spark": spark}

# ================= 主流程 =================
def fetch_all():
    result = {
        "generated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "date_jp": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y年%m月%d日"),
        "indexes": [], "etfs": [], "stocks": [], "japan": [], "fx": [], "commodities": [],
        "watch": [], "search_index": [],
        "risk_note": "风险评分权重(平衡型): 波动率35% + 趋势25% + RSI极端度20% + 52周位置20%。评分越高风险越大。AI预测为概率性判断，仅作参考，不构成投资建议。",
        "ai": None,
    }
    if yf is None:
        result["error"] = "yfinance 未安装"
        return result

    full_symbols = (
        [i["symbol"] for i in INDEXES] + [e["symbol"] for e in ETFS]
        + [s["symbol"] for s in STOCKS] + [j["symbol"] for j in JAPAN]
        + [f["symbol"] for f in FX] + [c["symbol"] for c in COMMODITIES]
    )

    # --- 精选池: 1年日线 ---
    try:
        data = yf.download(full_symbols, period="1y", interval="1d", group_by="ticker", threads=True, progress=False)
    except Exception as e:
        result["error"] = "下载失败: " + str(e)
        return result

    def build(sym, meta, bucket, with_info=False):
        try:
            sub = data[sym] if len(full_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if not a:
                return
            a.update(meta)
            if with_info:
                try:
                    t = yf.Ticker(sym)
                    info = t.info or {}
                    a["pe"] = info.get("trailingPE")
                    a["pb"] = info.get("priceToBook")
                    a["divYield"] = info.get("dividendYield")
                except Exception:
                    pass
            a["risk"] = risk_score(a)
            a["prediction"] = stat_prediction([c for _, c in a["history"]])
            bucket.append(a)
        except Exception:
            pass

    for item in INDEXES: build(item["symbol"], item, result["indexes"])
    for item in ETFS: build(item["symbol"], item, result["etfs"])
    for item in STOCKS: build(item["symbol"], item, result["stocks"], with_info=True)
    for item in JAPAN: build(item["symbol"], item, result["japan"], with_info=True)
    for item in FX: build(item["symbol"], item, result["fx"])
    for item in COMMODITIES: build(item["symbol"], item, result["commodities"])

    # --- 快照池: 1个月日线 ---
    snap_symbols = list(dict.fromkeys(SNAP_ETF + SNAP_STOCK + SNAP_JP + SNAP_HK))
    # 去掉与精选池重复的
    snap_symbols = [s for s in snap_symbols if s not in set(full_symbols)]
    seen = set()
    watch = []
    for i in range(0, len(snap_symbols), 100):
        batch = snap_symbols[i:i + 100]
        try:
            d = yf.download(batch, period="1mo", interval="1d", group_by="ticker", threads=True, progress=False)
        except Exception:
            continue
        for sym in batch:
            if sym in seen:
                continue
            seen.add(sym)
            try:
                sub = d[sym] if len(batch) > 1 else d
                a = analyze_snap(sub, sym)
                if a:
                    watch.append(a)
            except Exception:
                pass
    result["watch"] = watch

    # --- 搜索索引 ---
    idx = []
    for bucket, t in [(result["indexes"], "指数"), (result["etfs"], "ETF"), (result["stocks"], "美股"),
                      (result["japan"], "日股"), (result["fx"], "汇率"), (result["commodities"], "商品")]:
        for a in bucket:
            idx.append({"symbol": a["symbol"], "name": a.get("name", a["symbol"]),
                        "type": t, "region": a.get("region", ""),
                        "price": a.get("price"), "chg1d_pct": a.get("chg1d_pct")})
    for a in watch:
        region = "JP" if a["symbol"].endswith(".T") else ("HK" if a["symbol"].endswith(".HK") else "US")
        idx.append({"symbol": a["symbol"], "name": a["symbol"], "type": "ETF" if a["symbol"] in SNAP_ETF else ("股票" if a["symbol"] in SNAP_STOCK else "股票"),
                    "region": region, "price": a.get("price"), "chg1d_pct": a.get("chg1d_pct")})
    result["search_index"] = idx
    return result

if __name__ == "__main__":
    out = fetch_all()
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("OK: idx=%d etf=%d stock=%d jp=%d fx=%d comm=%d watch=%d search=%d err=%s" % (
        len(out["indexes"]), len(out["etfs"]), len(out["stocks"]), len(out["japan"]),
        len(out["fx"]), len(out["commodities"]), len(out["watch"]), len(out["search_index"]),
        out.get("error")))
