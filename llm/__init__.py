"""llm: LLM 调用封装 - Ingest/Query/Lint 三层提示词"""
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
    # Ingest 层：摄入新文档
    # ------------------------------------------------------------------ #
    def ingest(self, raw_text, content_type, title, source_url, existing_knowledge=""):
        type_desc = {
            "web": "这篇网页文章",
            "video": "这个视频（字幕或描述）",
            "pdf": "这份 PDF 文档",
            "docx": "这份 Word 文档",
        }.get(content_type, "这个文档")

        system_prompt = (
            "你是一个知识库管理员（Knowledge Base Curator）。\n"
            "你的职责是将任意来源的内容转化为高质量 Obsidian 笔记。\n\n"
            "工作原则：\n"
            "1. 增量优于覆盖：如果知识库已有相关条目，将新知识合并进去，不要简单覆盖\n"
            "2. 精确优于泛化：提取具体事实、数字、人名，而非泛泛描述\n"
            "3. 链接优先：识别文中出现的关键概念，在 wikilinks 中标注\n"
            "4. 来源可追溯：所有信息必须注明来源\n\n"
            "输出格式（严格 JSON，不要有其他内容）：\n"
            '{\n'
            '  "title": "精确简洁标题（保留原语言专有名词）",\n'
            '  "tags": ["概念1", "概念2", "领域/分类"],\n'
            '  "summary": "100-200字摘要",\n'
            '  "key_points": ["具体事实1（包含数字、人名、时间）", "具体事实2"],\n'
            '  "wikilinks": ["概念A", "概念B"],\n'
            '  "metadata": {"update_type":"new|updated|merged", "related_existing":["已有条目"], "confidence":"high|medium|low"}\n'
            "}"
        )

        user_prompt = (
            f"{type_desc}的标题是：{title or '无标题'}\n"
            f"来源：{source_url or '本地文件'}\n\n"
            f"{type_desc.replace('这', '')}内容如下：\n"
            f"---\n{raw_text[:8000]}\n---\n\n"
            + ("## 知识库已有条目（请合并）：\n" + existing_knowledge + "\n\n" if existing_knowledge else "")
            + "请严格输出 JSON，不要有其他文字。"
        )

        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.2)
        return self._parse_json(raw)

    # ------------------------------------------------------------------ #
    # Query 层：回答问题
    # ------------------------------------------------------------------ #
    def query(self, question, context):
        system_prompt = (
            "你是一个知识助手，同时是知识库管理员。\n"
            "两步工作：\n"
            "1. 回答问题：基于知识库中的已有资料准确回答用户问题\n"
            "2. 知识补充：判断知识库是否有遗漏，如果有必要补充，生成新 wiki 条目建议\n\n"
            "回答要求：\n"
            "- 综合多条已有知识，不要仅引用一条\n"
            "- 用中文回答，除非问题本身是英文\n"
            "- 如现有知识不足以回答，诚实说明，不要编造\n"
            "- 在回答末尾评估知识库的完整性\n\n"
            "输出格式（严格 JSON，不要有其他内容）：\n"
            '{\n'
            '  "answer": "完整回答（Markdown 格式）",\n'
            '  "sources": ["[[条目名]]", "来源2"],\n'
            '  "confidence": "high|medium|low",\n'
            '  "gaps": ["知识缺口1"],\n'
            '  "backfill": {"title":"新条目标题","tags":["标签"],"summary":"50-100字","key_points":["要点"]}\n'
            "}"
        )

        user_prompt = (
            "## 用户问题\n"
            + question + "\n\n"
            "## 知识库上下文\n"
            "---\n" + context + "\n---\n\n"
            "请严格输出 JSON。"
        )

        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.3)
        return self._parse_json(raw)

    # ------------------------------------------------------------------ #
    # Lint 层：质量检查
    # ------------------------------------------------------------------ #
    def lint(self, all_summaries, all_links, entries):
        system_prompt = (
            "你是一个知识库审计员（Knowledge Base Auditor）。\n"
            "检查整个个人知识库，发现质量问题。\n\n"
            "检查维度：\n"
            "1. 准确性：不同条目对同一事实的描述是否一致\n"
            "2. 时效性：是否存在过时信息（如旧版本号、过时数据）\n"
            "3. 完整性：是否存在重要概念缺失相关条目\n"
            "4. 链接密度：相关概念之间是否缺少 wikilink\n"
            "5. 写作质量：摘要是否过于泛泛、要点是否缺乏细节\n\n"
            "评分标准（0-100）：\n"
            "90+: 高质量，知识密集，链接丰富，无矛盾\n"
            "70-89: 良好，有少量改进空间\n"
            "50-69: 一般，存在明显遗漏或质量问题\n"
            "<50: 需要大量重构\n\n"
            "输出格式（严格 JSON，不要有其他内容）：\n"
            '{\n'
            '  "score": 85,\n'
            '  "overall_assessment": "整体评估（一段话）",\n'
            '  "issues": [\n'
            '    {"type":"contradiction|outdated|missing_link|low_quality|orphaned","severity":"high|medium|low","title":"涉及条目","description":"问题描述","suggestion":"修改建议"}\n'
            '  ],\n'
            '  "improvements": ["改进建议1", "改进建议2"]\n'
            "}"
        )

        entry_text = "\n\n".join(
            f"### {e['title']}\n标签: {','.join(e.get('tags', []))}\n摘要: {e.get('summary', '')[:200]}"
            for e in entries
        )

        user_prompt = (
            "## 知识库整体摘要\n"
            "---\n" + all_summaries + "\n---\n\n"
            f"## 所有链接概念（共 {len(all_links)} 个）\n{', '.join(sorted(all_links))}\n\n"
            "## 详细条目\n"
            "---\n" + entry_text + "\n---\n\n"
            "请严格输出 JSON。"
        )

        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.2)
        return self._parse_json(raw)
