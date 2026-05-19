import json
import re
from typing import Any

def extract_ontology(text: str, prompt_content: str, model_config: dict, model_name: str, retry_count: int = 3) -> dict:
    provider = model_config.get("provider", "openai")
    api_key = model_config.get("api_key", "")
    api_base = model_config.get("api_base")

    messages = [
        {"role": "system", "content": prompt_content},
        {"role": "user", "content": f"请从以下文档中提取本体信息，以JSON格式返回：\n\n{text}"},
    ]

    for attempt in range(retry_count):
        try:
            raw = _call_llm(provider, api_key, api_base, model_name, messages)
            return _parse_response(raw)
        except Exception as e:
            if attempt == retry_count - 1:
                raise
    return {}


def infer_relations(entities: list, existing_relations: list, text: str,
                    model_config: dict, model_name: str) -> list:
    """Second-pass relation inference: find IS-A / PART-OF / INSTANCE-OF links the first pass missed."""
    if len(entities) < 3:
        return []

    provider  = model_config.get("provider", "openai")
    api_key   = model_config.get("api_key", "")
    api_base  = model_config.get("api_base")

    # Build entity snapshot (limit to 50 to keep prompt manageable)
    entity_lines = "\n".join(
        f"- {e.get('name_cn','?')} ({e.get('type','?')}): {(e.get('description') or '')[:60]}"
        for e in entities[:50]
    )
    existing_set = {
        (r.get("source"), r.get("type"), r.get("target"))
        for r in existing_relations
        if r.get("source") and r.get("target")
    }

    system_prompt = (
        "你是本体关系补全专家。给定已提取实体列表和原始文档，找出实体间遗漏的层级和关联关系。\n\n"
        "关系类型（只能使用以下类型）：IS-A、PART-OF、INSTANCE-OF、supply、stores、processes、treats、causes、关联\n\n"
        "重点寻找：\n"
        "1. IS-A：A 是 B 的一种（如 销售费用 IS-A 费用）\n"
        "2. PART-OF：A 是 B 的组成部分（如 流动资产 PART-OF 资产）\n"
        "3. INSTANCE-OF：A 是 B 的具体实例（如 华为供应链 INSTANCE-OF S级战略客户）\n\n"
        "要求：\n"
        "- 只输出新发现的关系，不要重复已有关系\n"
        "- source 和 target 必须是实体列表中的 name_cn\n"
        "- 每对实体最多一条关系\n"
        "- 至少找 10 条，最多 30 条\n\n"
        '返回 JSON（不要有其他文字）：{"relations": [{"source": "A", "target": "B", "type": "IS-A", "confidence": 0.85}]}'
    )
    user_msg = (
        f"已提取实体：\n{entity_lines}\n\n"
        f"文档节选：\n{text[:2500]}"
    )

    try:
        raw = _call_llm(provider, api_key, api_base, model_name,
                        [{"role": "system", "content": system_prompt},
                         {"role": "user", "content": user_msg}])
        parsed = _parse_response(raw)
        candidates = parsed.get("relations", []) if isinstance(parsed, dict) else (parsed if isinstance(parsed, list) else [])

        new_rels = []
        for r in candidates:
            if not isinstance(r, dict):
                continue
            key = (r.get("source"), r.get("type"), r.get("target"))
            if key[0] and key[2] and key not in existing_set:
                new_rels.append(r)
                existing_set.add(key)
        return new_rels
    except Exception:
        return []  # relation inference failure is non-fatal


def _call_llm(provider: str, api_key: str, api_base: str | None, model: str, messages: list) -> str:
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=model, max_tokens=4096,
            system=messages[0]["content"],
            messages=[{"role": "user", "content": messages[1]["content"] + "\n\n```json\n{"}],
        )
        return "{" + resp.content[0].text
    else:
        import openai
        kwargs = {"api_key": api_key}
        if api_base:
            kwargs["base_url"] = api_base
        client = openai.OpenAI(**kwargs)
        resp = client.chat.completions.create(
            model=model, messages=messages,
            response_format={"type": "json_object"},
            timeout=180,
            max_tokens=8192,
        )
        return resp.choices[0].message.content

def _parse_response(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Cannot parse LLM response as JSON: {raw[:200]}")
