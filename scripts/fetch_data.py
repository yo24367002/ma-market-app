# -*- coding: utf-8 -*-
"""
fetch_data.py - 拉取全球市场数据，计算技术指标与风险评分，输出 data.json
用于 GitHub Actions 每日定时运行 + 本地测试
"""
import json
import math
import sys
import datetime
import traceback

try:
    import yfinance as yf
except ImportError:
    yf = None

# ---------- 数据池 ----------
INDEXES = [
    {"symbol": "^GSPC", "name": "S&P 500", "region": "US"},
    {"symbol": "^DJI", "name": "道琼斯", "region": "US"},
    {"symbol": "^IXIC", "name": "纳斯达克", "region": "US"},
    {"symbol": "^N225", "name": "日经225", "region": "JP"},
    {"symbol": "^HSI", "name": "恒生", "region": "HK"},
    {"symbol": "^KS11", "name": "KOSPI", "region": "KR"},
    {"symbol": "^AXJO", "name": "ASX200", "region": "AU"},
    {"symbol": "^STI", "name": "海峡时报STI", "region": "SG"},
    {"symbol": "^FTSE", "name": "英国富时100", "region": "UK"},
    {"symbol": "^GDAXI", "name": "德国DAX", "region": "DE"},
]

ETFS = [
    {"symbol": "SPY", "name": "S&P 500 ETF", "region": "US"},
    {"symbol": "QQQ", "name": "纳斯达克100 ETF", "region": "US"},
    {"symbol": "VTI", "name": "全美股 ETF", "region": "US"},
    {"symbol": "VXUS", "name": "全球除美 ETF", "region": "Global"},
    {"symbol": "VEA", "name": "发达市场除美 ETF", "region": "Global"},
    {"symbol": "EEM", "name": "新兴市场 ETF", "region": "EM"},
    {"symbol": "IWM", "name": "美股小盘 ETF", "region": "US"},
    {"symbol": "EWJ", "name": "日本股 ETF", "region": "JP"},
    {"symbol": "GLD", "name": "黄金 ETF", "region": "Gold"},
    {"symbol": "TLT", "name": "美国长期债 ETF", "region": "Bond"},
    {"symbol": "BND", "name": "美国综合债 ETF", "region": "Bond"},
]

STOCKS = [
    {"symbol": "AAPL", "name": "苹果", "region": "US"},
    {"symbol": "MSFT", "name": "微软", "region": "US"},
    {"symbol": "NVDA", "name": "英伟达", "region": "US"},
    {"symbol": "GOOGL", "name": "谷歌", "region": "US"},
    {"symbol": "AMZN", "name": "亚马逊", "region": "US"},
    {"symbol": "TSLA", "name": "特斯拉", "region": "US"},
    {"symbol": "META", "name": "Meta", "region": "US"},
    {"symbol": "JPM", "name": "摩根大通", "region": "US"},
    {"symbol": "XOM", "name": "埃克森美孚", "region": "US"},
]

FX = [
    {"symbol": "JPY=X", "name": "美元/日元"},
    {"symbol": "EURJPY=X", "name": "欧元/日元"},
    {"symbol": "GBPJPY=X", "name": "英镑/日元"},
    {"symbol": "AUDJPY=X", "name": "澳元/日元"},
]

COMMODITIES = [
    {"symbol": "GC=F", "name": "黄金", "unit": "美元/盎司"},
    {"symbol": "CL=F", "name": "WTI原油", "unit": "美元/桶"},
]

# ---------- 指标计算 ----------
def rsi(series, period=14):
    """标准 RSI(14)"""
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
    """基于近 period 日收益率的年化波动率(%)"""
    if len(series) < period + 1:
        return None
    rets = [(series[i] / series[i - 1]) - 1 for i in range(len(series) - period, len(series))]
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / len(rets)
    return math.sqrt(var) * math.sqrt(252) * 100

def analyze_history(hist, symbol):
    """从历史行情计算指标"""
    if hist is None or hist.empty:
        return None
    closes = [float(v) for v in hist["Close"].dropna().tolist()]
    if len(closes) < 30:
        return None
    last = closes[-1]
    prev_day = closes[-2] if len(closes) > 1 else last
    prev_week = closes[-6] if len(closes) > 5 else closes[0]
    high_52 = max(closes)
    low_52 = min(closes)
    pct52 = (last - low_52) / (high_52 - low_52) * 100 if high_52 != low_52 else 50.0
    r = rsi(closes)
    ma20 = ma(closes, 20)
    ma50 = ma(closes, 50)
    ma200 = ma(closes, 200)
    # 趋势分: 2=强(价>ma20>ma50), 1=中, 0=弱
    trend = 1
    if ma20 and ma50:
        if last > ma20 > ma50:
            trend = 2
        elif last < ma20 < ma50:
            trend = 0
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
    }

# ---------- 风险评分（平衡型权重） ----------
def risk_score(item):
    """返回 0-100 风险分 + 等级。权重: 波动率35% 趋势25% RSI极端20% 52周位置20%"""
    if item is None or item.get("vol20_annual_pct") is None:
        return {"score": None, "level": "数据不足", "color": "#999"}
    vol = item["vol20_annual_pct"]
    trend = item["trend"]
    rsi = item.get("rsi14") or 50
    pct52 = item.get("pct52w") or 50
    # 波动率: 0-35 分, 年化 8% 以下接近 0, 40% 以上顶格
    s_vol = min(vol / 40.0, 1.0) * 35
    # 趋势: 弱(0)=25分, 中(1)=12.5, 强(2)=0
    s_trend = (2 - trend) * 12.5
    # RSI: >75 或 <30 风险高
    s_rsi = 0.0
    if rsi >= 80:
        s_rsi = 20.0
    elif rsi >= 70:
        s_rsi = 13.0
    elif rsi <= 30:
        s_rsi = 8.0
    elif rsi <= 20:
        s_rsi = 15.0
    else:
        s_rsi = 4.0
    # 52周位置: 越高越追高, 15%以下超跌风险
    s_pos = 0.0
    if pct52 >= 90:
        s_pos = 20.0
    elif pct52 >= 75:
        s_pos = 12.0
    elif pct52 >= 40:
        s_pos = 5.0
    elif pct52 >= 15:
        s_pos = 10.0
    else:
        s_pos = 16.0
    total = round(s_vol + s_trend + s_rsi + s_pos, 1)
    if total >= 65:
        level, color = "高风险", "#e5484d"
    elif total >= 45:
        level, color = "中高风险", "#f76b15"
    elif total >= 28:
        level, color = "中风险", "#f5a623"
    else:
        level, color = "低风险", "#30a46c"
    return {"score": total, "level": level, "color": color}

# ---------- 拉取 ----------
def fetch_all():
    result = {
        "generated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "date_jp": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y年%m月%d日"),
        "indexes": [], "etfs": [], "stocks": [], "fx": [], "commodities": [],
        "risk_note": "风险评分权重(平衡型): 波动率35% + 趋势25% + RSI极端度20% + 52周位置20%。评分越高风险越大，仅作参考，不构成投资建议。",
        "ai": None,
    }
    all_symbols = (
        [i["symbol"] for i in INDEXES]
        + [e["symbol"] for e in ETFS]
        + [s["symbol"] for s in STOCKS]
        + [f["symbol"] for f in FX]
        + [c["symbol"] for c in COMMODITIES]
    )
    if yf is None:
        result["error"] = "yfinance 未安装"
        return result
    try:
        data = yf.download(all_symbols, period="1y", interval="1d", group_by="ticker", threads=True, progress=False)
    except Exception as e:
        result["error"] = "下载失败: " + str(e)
        return result

    for item in INDEXES:
        sym = item["symbol"]
        try:
            sub = data[sym] if len(all_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if a:
                a.update(item)
                a["risk"] = risk_score(a)
                result["indexes"].append(a)
        except Exception:
            pass
    for item in ETFS:
        sym = item["symbol"]
        try:
            sub = data[sym] if len(all_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if a:
                a.update(item)
                a["risk"] = risk_score(a)
                result["etfs"].append(a)
        except Exception:
            pass
    for item in STOCKS:
        sym = item["symbol"]
        try:
            sub = data[sym] if len(all_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if a:
                a.update(item)
                # 个股附加估值（尽力而为）
                try:
                    t = yf.Ticker(sym)
                    info = t.info or {}
                    a["pe"] = info.get("trailingPE")
                    a["pb"] = info.get("priceToBook")
                    a["divYield"] = info.get("dividendYield")
                except Exception:
                    pass
                a["risk"] = risk_score(a)
                result["stocks"].append(a)
        except Exception:
            pass
    for item in FX:
        sym = item["symbol"]
        try:
            sub = data[sym] if len(all_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if a:
                a.update(item)
                result["fx"].append(a)
        except Exception:
            pass
    for item in COMMODITIES:
        sym = item["symbol"]
        try:
            sub = data[sym] if len(all_symbols) > 1 else data
            a = analyze_history(sub, sym)
            if a:
                a.update(item)
                a["risk"] = risk_score(a)
                result["commodities"].append(a)
        except Exception:
            pass
    return result

if __name__ == "__main__":
    out = fetch_all()
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("OK: indexes=%d etfs=%d stocks=%d fx=%d commodities=%d err=%s" % (
        len(out["indexes"]), len(out["etfs"]), len(out["stocks"]), len(out["fx"]), len(out["commodities"]),
        out.get("error")))
