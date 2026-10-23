# -*- coding: utf-8 -*-
"""
ai_analysis.py v2 - Gemini AI 分析
1. 对重点标的生成 AI 预测 (方向/置信度/支撑压力/理由), 写入 prediction.ai
2. 生成全市场 AI 解读 (市场环境 + 今日关注 2-4 个标的带预测), 写入 ai
读 data.json -> 写回 data.json
"""
import json
import os
import sys
import urllib.request

API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")

def call_gemini(system, user, temperature=0.3):
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return None
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": 4000,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode("utf-8"))
        return out["choices"][0]["message"]["content"]
    except Exception as e:
        return None

def extract_json(text):
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        s = s.rsplit("```", 1)[0]
    try:
        return json.loads(s)
    except Exception:
        i = s.find("{")
        j = s.rfind("}")
        if i >= 0 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except Exception:
                return None
    return None

def analyze_all(data):
    if not data.get("indexes") and not data.get("etfs"):
        return data
    # ---- 1) 重点标的 AI 预测 ----
    key_items = (
        data["indexes"][:6] + data["etfs"][:6] + data["stocks"][:5] + data["japan"][:3]
    )
    cands = []
    for it in key_items:
        hist = it.get("history") or []
        closes = [c for _, c in hist][-30:]
        pred = it.get("prediction") or {}
        cands.append({
            "symbol": it["symbol"],
            "name": it.get("name", it["symbol"]),
            "price": it.get("price"),
            "chg1d": it.get("chg1d_pct"),
            "rsi14": it.get("rsi14"),
            "ma20": it.get("ma20"), "ma50": it.get("ma50"),
            "vol_ann": it.get("vol20_annual_pct"),
            "pct52": it.get("pct52w"),
            "trend": it.get("trend"),
            "risk_level": (it.get("risk") or {}).get("level"),
            "last30": closes,
            "stat": pred.get("horizons"),
        })

    sys_p = (
        "你是资深全球市场分析师。请对以下标的逐个给出短期(未来5/10/20个交易日)走势判断。"
        "规则：1) 只输出JSON数组，不要任何其他文字；2) 每项字段：symbol, direction(偏多/偏空/震荡), "
        "confidence(0-100整数), support(未来10日关键支撑价), resistance(未来10日关键压力价), "
        "rationale(一句30字内中文理由，结合RSI、均线、趋势、波动率)；"
        "3) support低于现价、resistance高于现价，数字与现价同量级；4) 判断要有依据，不模棱两可。"
    )
    user_p = json.dumps(cands, ensure_ascii=False)[:12000]
    resp = call_gemini(sys_p, user_p, temperature=0.2)
    arr = extract_json(resp)
    if isinstance(arr, list):
        for r in arr:
            sym = r.get("symbol")
            for it in key_items:
                if it["symbol"] == sym and it.get("prediction"):
                    conf = r.get("confidence")
                    if conf is None or not isinstance(conf, (int, float)):
                        d = r.get("direction")
                        if d == "偏多" or d == "偏空":
                            conf = 62 if it.get("trend") in (0, 2) else 55
                        else:
                            conf = 48
                    try:
                        conf = max(0, min(100, int(conf)))
                    except Exception:
                        conf = 50
                    it["prediction"]["confidence"] = conf
                    it["prediction"]["ai"] = {
                        "direction": r.get("direction"),
                        "support": r.get("support"),
                        "resistance": r.get("resistance"),
                        "rationale": r.get("rationale"),
                    }
                    break

    # ---- 2) 全市场 AI 解读 ----
    summary = []
    for grp, name in [("indexes", "指数"), ("etfs", "ETF"), ("stocks", "美股"), ("japan", "日股")]:
        for it in data.get(grp, [])[:12]:
            summary.append(f"{it.get('name', it['symbol'])}({it['symbol']}) 现价{it.get('price')} 当日{it.get('chg1d_pct')}% 周涨{it.get('chg1w_pct')}% RSI{it.get('rsi14')} 风险{((it.get('risk') or {}).get('level'))}")
    ai_pick = []
    for it in data["indexes"][:3] + data["etfs"][:3] + data["stocks"][:2] + data["japan"][:1]:
        p = it.get("prediction") or {}
        ai = p.get("ai") or {}
        stat = p.get("horizons") or {}
        ai_pick.append(f"{it.get('name')}({it['symbol']}): 现价{it.get('price')}, AI判断{ai.get('direction') or p.get('direction')}, 置信度{ai.get('confidence') or '--'}%, 10日中枢{((stat.get('d10') or {}).get('center'))}, 支撑{ai.get('support')}, 压力{ai.get('resistance')}, 理由:{ai.get('rationale') or ''}")

    sys_m = (
        "你是资深全球市场分析师，面向在日平衡型个人投资者写每日市场简报。"
        "输出JSON对象，字段：environment(今日市场环境300字内,中文，结合主要指数涨跌、避险情绪、美元日元方向，"
        "说明对在日投资者影响), focus(今日值得关注的标的,2-4个,每项{symbol,name,why(70字内理由),risk(一句风险提示)}), "
        "advice(给平衡型投资者的操作建议150字内，含仓位思路), disclaimer(固定为'以上为AI生成分析，不构成投资建议，市场有风险，决策需谨慎。')"
    )
    user_m = (
        "今日数据概要:\n" + "\n".join(summary[:60])
        + "\n\nAI预测重点:\n" + "\n".join(ai_pick)
        + f"\n\n生成日期: {data.get('date_jp')}"
    )
    resp2 = call_gemini(sys_m, user_m, temperature=0.4)
    obj = extract_json(resp2)
    if isinstance(obj, dict):
        data["ai"] = obj
    else:
        data["ai"] = {"environment": "AI解读生成失败(模型未返回结构化结果)，请稍后重试或查看行情自行判断。", "focus": [], "advice": "", "disclaimer": "以上为AI生成分析，不构成投资建议，市场有风险，决策需谨慎。"}
    return data

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data = analyze_all(data)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    ai = data.get("ai") or {}
    env = ai.get("environment", "")
    print("OK ai_env=%d chars, focus=%d, key_predictions=%d" % (
        len(env), len(ai.get("focus") or []),
        sum(1 for it in data.get("indexes", [])[:6] + data.get("etfs", [])[:6] if (it.get("prediction") or {}).get("ai"))))
