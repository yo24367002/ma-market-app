# -*- coding: utf-8 -*-
"""
ai_analysis.py - 读取 data.json，调用 Gemini API 生成专业市场解读与关注列表，写回 data.json
"""
import json
import os
import urllib.request

API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
MODEL = "gemini-3.5-flash-lite"


def call_gemini(system, user):
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return "（未设置 GEMINI_API_KEY，跳过 AI 解读）"
    body = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.6,
        "max_tokens": 1200,
    }).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    except Exception as e:
        return "（AI 解读生成失败：" + type(e).__name__ + "）"


def build_prompt(d):
    lines = []
    lines.append("以下是今日全球市场数据（北京时间生成时间：" + d.get("generated_at", "") + "）：\n")
    lines.append("【主要指数】")
    for it in d.get("indexes", []):
        lines.append("- %s(%s): %.2f 当日%+.2f%% 周涨跌%+.2f%% RSI=%.0f 波动率=%.1f%% 风险=%s(%s)"
                     % (it["name"], it["region"], it["price"], it.get("chg1d_pct") or 0,
                        it.get("chg1w_pct") or 0, it.get("rsi14") or 0,
                        it.get("vol20_annual_pct") or 0, it["risk"]["level"], it["risk"]["score"]))
    lines.append("\n【ETF / 资产类别】")
    for it in d.get("etfs", []):
        lines.append("- %s(%s): %.2f 当日%+.2f%% RSI=%.0f 52周位置=%.0f%% 风险=%s"
                     % (it["name"], it["region"], it["price"], it.get("chg1d_pct") or 0,
                        it.get("rsi14") or 0, it.get("pct52w") or 0, it["risk"]["level"]))
    lines.append("\n【代表性个股】")
    for it in d.get("stocks", [])[:6]:
        lines.append("- %s(%s): %.2f 当日%+.2f%% 风险=%s"
                     % (it["name"], it["region"], it["price"], it.get("chg1d_pct") or 0, it["risk"]["level"]))
    lines.append("\n【汇率/商品】")
    for it in d.get("fx", []) + d.get("commodities", []):
        lines.append("- %s: %.2f 当日%+.2f%%" % (it["name"], it["price"], it.get("chg1d_pct") or 0))
    return "\n".join(lines)


def main():
    with open("data.json", "r", encoding="utf-8") as f:
        d = json.load(f)
    system = (
        "你是一名专业的全球市场分析师，服务对象是住在日本的个人投资者（风险偏好：平衡型，刚开SBI证券账户的新手）。"
        "请基于给定的真实数据，用中文输出以下三部分，格式用 markdown 列表，简洁专业：\n"
        "1.【今日市场环境】用3-4句话概括当日全球市场整体情绪、主要驱动和关键风险（不要编造数据之外的消息面，只做数据面解读）；\n"
        "2.【今日值得关注】从ETF和股票中挑2-4个，每个给出：推荐关注理由（结合估值/趋势/波动率）+ 明确的风险提示；\n"
        "3.【平衡型投资者提示】结合风险评分给出1-2条仓位/风险管理的具体建议。\n"
        "规则：所有结论必须基于给定数据；标注\"以上为AI参考分析，不构成投资建议\"。"
    )
    user = build_prompt(d)
    text = call_gemini(system, user)
    d["ai"] = {"text": text, "model": MODEL, "generated_at": d.get("generated_at", "")}
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print("AI done")


if __name__ == "__main__":
    main()
