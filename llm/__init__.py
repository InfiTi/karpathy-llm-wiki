"""llm: LLM 调用封装，提示词由调用方传入"""
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
    # Ingest：prompts = {"system": "...", "user": "..."}
    # ------------------------------------------------------------------ #
    def ingest(self, raw_text, content_type, title, source_url,
               existing_knowledge="", prompts=None):
        if prompts is None:
            prompts = self._default_ingest_prompts()
        type_desc = {
            "web": "这篇网页文章",
            "video": "这个视频（字幕或描述）",
            "pdf": "这份 PDF 文档",
            "docx": "这份 Word 文档",
        }.get(content_type, "这个文档")
        user = prompts["user"].format(
            type_desc=type_desc,
            title=title or "无标题",
            source_url=source_url or "本地文件",
            raw_text=raw_text[:8000],
            existing_knowledge=(
                "## 知识库已有条目（请合并）：\n" + existing_knowledge + "\n\n"
                if existing_knowledge else ""
            ),
        )
        raw = self.chat([
            {"role": "system", "content": prompts["system"]},
            {"role": "user", "content": user},
        ], temperature=0.2)
        return self._parse_json(raw)

    def _default_ingest_prompts(self):
        return {
            "system": (
                "你是一个知识库管理员。转化内容为 Obsidian 笔记。\n"
                "原则：增量覆盖、精确优先、链接优先、注明来源。\n"
                "输出 JSON：{title,tags,summary,key_points,wikilinks,metadata}"
            ),
            "user": (
                "{type_desc}标题：{title}\n来源：{source_url}\n\n"
                "内容：\n---\n{raw_text}\n---\n\n{existing_knowledge}"
                "请严格输出 JSON。"
            ),
        }

    # ------------------------------------------------------------------ #
    # Query：prompts = {"system": "...", "user": "..."}
    # ------------------------------------------------------------------ #
    def query(self, question, context, prompts=None):
        if prompts is None:
            prompts = self._default_query_prompts()
        user = prompts["user"].format(question=question, context=context)
        raw = self.chat([
            {"role": "system", "content": prompts["system"]},
            {"role": "user", "content": user},
        ], temperature=0.3)
        return self._parse_json(raw)

    def _default_query_prompts(self):
        return {
            "system": (
                "你是知识助手+管理员。综合多条知识回答，判断缺口，可生成新条目。\n"
                "输出 JSON：{answer,sources,confidence,gaps,backfill}"
            ),
            "user": "## 用户问题\n{question}\n\n## 知识库上下文\n---\n{context}\n---\n\n请严格输出 JSON。",
        }

    # ------------------------------------------------------------------ #
    # Lint：prompts = {"system": "...", "user": "..."}
    # ------------------------------------------------------------------ #
    def lint(self, all_summaries, all_links, entries, prompts=None):
        if prompts is None:
            prompts = self._default_lint_prompts()
        entry_text = "\n\n".join(
            f"### {e['title']}\n标签: {','.join(e.get('tags', []))}\n摘要: {e.get('summary', '')[:200]}"
            for e in entries
        )
        user = prompts["user"].format(
            all_summaries=all_summaries,
            total_links=len(all_links),
            all_links=", ".join(sorted(all_links)),
            entry_text=entry_text,
        )
        raw = self.chat([
            {"role": "system", "content": prompts["system"]},
            {"role": "user", "content": user},
        ], temperature=0.2)
        return self._parse_json(raw)

    def _default_lint_prompts(self):
        return {
            "system": (
                "你是知识库审计员。评分（0-100）、发现矛盾/过时/缺失链接/质量问题。\n"
                "输出 JSON：{score,overall_assessment,issues,improvements}"
            ),
            "user": (
                "## 知识库摘要\n---\n{all_summaries}\n---\n\n"
                "## 链接概念（共 {total_links} 个）\n{all_links}\n\n"
                "## 详细条目\n---\n{entry_text}\n---\n\n请严格输出 JSON。"
            ),
        }
