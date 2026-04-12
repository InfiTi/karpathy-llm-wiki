"""llm: LLM 调用封装，SCHEMA 模式：直接输出 Markdown"""
import requests, json, re


class LLMClient:
    def __init__(self, base_url, model, api_key="ollama", timeout=180):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def _post(self, payload):
        headers = {"Content-Type": "application/json"}
        if self.api_key and self.api_key != "ollama":
            headers["Authorization"] = f"Bearer {self.api_key}"
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=headers, json=payload, timeout=self.timeout
        )
        return json.loads(resp.content.decode("utf-8"))

    def chat(self, messages, temperature=0.3):
        payload = {"model": self.model, "messages": messages, "temperature": temperature}
        return self._post(payload)["choices"][0]["message"]["content"]

    # ------------------------------------------------------------------ #
    # Ingest（SCHEMA 模式）：直接返回 Markdown 字符串
    # ------------------------------------------------------------------ #
    def ingest(self, raw_text, content_type, title, source_url,
               page_type, schema_text, existing_knowledge="",
               user_instructions="", prompts=None):
        """
        按 SCHEMA 规范编译原始资料，返回 Markdown 字符串。

        参数:
          raw_text        - 原始内容（截断到 8000 字）
          content_type    - web/video/pdf/docx
          title           - 原始标题
          source_url      - 来源 URL
          page_type       - SCHEMA 规定的页面类型（concept/paper/person/tool/dataset/note）
          schema_text     - 完整 SCHEMA.md 内容（第一步）
          existing_knowledge - 已有 wiki 条目摘要（用于增量合并）
          user_instructions   - 执行指令（第二步）
          prompts         - 可选，prompts["system"] 和 prompts["user"] 会替换
        """
        # 构建三步合一的消息
        schema_block = schema_text or ""

        system_prompt = (
            "你是一个严格的 LLM Wiki 编译系统。\n"
            "严格遵守以下 SCHEMA 规范输出，不输出任何解释，只输出 Markdown 维基页面。"
        )

        user_prompt = (
            f"{schema_block}\n\n"
            "## 提示词 / 执行指令\n"
            "你是 LLM Wiki 自动编译系统。\n"
            "请严格遵守上方 SCHEMA 所有规则，对下方原始资料进行结构化编译：\n"
            "- 只输出最终的 Markdown 维基页面，不解释、不闲聊\n"
            "- 每页独立成文件，文件名小写+短横线\n"
            "- 强制添加 [[内部链接]]，每页至少 5 个\n"
            "- 禁止幻觉，所有内容必须来自原始资料\n"
            "- 矛盾信息标注 ⚠️\n"
            "- 判断原始资料类型，选择最合适的 page type：\n"
            "  paper（论文）/ concept（概念）/ tool（工具）/ person（人物）/ dataset（数据集）/ note（笔记）\n"
            "- 如果原始资料包含多个独立主题，请拆分为多个 wiki 页面\n"
            f"- 本次推荐 page_type：{page_type}\n\n"
            f"## 原始资料\n\n"
            f"来源：{source_url or '本地文件'}\n"
            f"原始标题：{title or '无标题'}\n"
            f"推荐 page_type：{page_type}\n\n"
            "---\n"
            f"{raw_text[:8000]}\n"
            "---\n\n"
            f"{existing_knowledge}"
            "请输出 Markdown 维基页面："
        )

        return self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.1)

    # ------------------------------------------------------------------ #
    # Query
    # ------------------------------------------------------------------ #
    def query(self, question, context, prompts=None):
        system_prompt = prompts.get("system") if prompts else self._default_query_system()
        user_prompt = prompts.get("user", "").format(question=question, context=context)
        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.3)
        return self._parse_json(raw)

    def _default_query_system(self):
        return (
            "你是一个知识助手，同时是知识库管理员（LLM Wiki）。\n"
            "两步工作：1. 回答问题 2. 知识补充建议。\n"
            "输出严格 JSON。"
        )

    def _parse_json(self, raw):
        cleaned = re.sub(r"^```json\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            return json.loads(cleaned)
        except Exception:
            m = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except Exception:
                    pass
        raise ValueError(f"LLM 返回无法解析为 JSON: {raw[:200]}")

    # ------------------------------------------------------------------ #
    # Lint
    # ------------------------------------------------------------------ #
    def lint(self, all_summaries, all_links, entries, prompts=None):
        system_prompt = prompts.get("system") if prompts else self._default_lint_system()
        entry_text = "\n\n".join(
            f"### {e['title']}\n标签: {','.join(e.get('tags', []))}\n摘要: {e.get('summary', '')[:200]}"
            for e in entries
        )
        user_prompt = (
            f"## 知识库摘要\n---\n{all_summaries}\n---\n\n"
            f"## 所有链接概念（共 {len(all_links)} 个）\n{', '.join(sorted(all_links))}\n\n"
            f"## 详细条目\n---\n{entry_text}\n---\n\n请严格输出 JSON。"
        )
        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.2)
        return self._parse_json(raw)

    def _default_lint_system(self):
        return (
            "你是知识库审计员。严格对照 SCHEMA v1.1 检查 wiki/ 质量。\n"
            "输出严格 JSON：{score,overall_assessment,issues,improvements}。"
        )
