"""config: Vault 路径、LLM 后端、SCHEMA 路径、提示词模板配置"""
import json, os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "..", "SCHEMA.md")

# 6 种固定页面类型（来自 SCHEMA）
PAGE_TYPES = ["concept", "paper", "person", "tool", "dataset", "note"]

# 内容类型 → 默认 page_type 映射
CONTENT_TYPE_TO_PAGE_TYPE = {
    "web":       "concept",
    "video":     "note",
    "pdf":       "paper",
    "docx":      "note",
    "paper":     "paper",
    "article":   "concept",
    "note":      "note",
    "default":   "note",
}

DEFAULTS = {
    "vault_path": r"F:\Obsidian\AI\llm-wiki",
    "llm_url": "http://localhost:11434/v1",
    "model": "qwen3.5",
    "api_key": "ollama",
    "enable_thinking": False,
    # SCHEMA.md 文件路径
    "schema_path": SCHEMA_FILE,
    # 是否启用 SCHEMA 严格模式（替换旧的 JSON 格式）
    "use_schema_mode": True,

    # ---- Ingest System Prompt（第一步：宪法）----
    "prompt_ingest_system": (
        "【宪法 / SCHEMA v1.1】\n"
        "本文档是本 LLM Wiki 的唯一规则手册与编辑规范。\n"
        "所有页面生成、更新、链接、命名、格式必须严格遵循本 Schema。\n\n"
        "## 1. 目录结构\n"
        "- raw/：原始资料入口，只读，不可修改、不可删除。\n"
        "- wiki/：LLM 自动编译输出的结构化维基页面，人类可读可编辑。\n"
        "- schema/：规则、模板、标签词典、命名规范。\n\n"
        "## 2. 页面类型规范（只允许以下 6 种）\n"
        "1. concept —— 概念、定义、原理\n"
        "2. paper —— 论文、技术报告\n"
        "3. person —— 研究者、从业者\n"
        "4. tool —— 框架、库、工具、系统\n"
        "5. dataset —— 数据集、评测基准\n"
        "6. note —— 笔记、摘要、个人理解\n\n"
        "## 3. 页面命名规则\n"
        "- 统一使用小写字母 + 短横线\n"
        "- 无空格、无特殊符号、无中文标点\n"
        "- 示例：attention-mechanism.md、2017-transformer.md、andrej-karpathy.md\n"
        "- 一篇论文一页、一个概念一页、一个工具一页。\n\n"
        "## 4. 页面固定格式（Frontmatter + 结构）\n"
        "每个页面顶部必须包含：\n"
        "```yaml\n"
        "---\n"
        "title: 页面标准名称\n"
        "type: concept/paper/person/tool/dataset/note\n"
        "tags: [tag1, tag2, tag3]\n"
        "created: YYYY-MM-DD\n"
        "source: raw/文件名.pdf\n"
        "linked: [页面1, 页面2]\n"
        "---\n"
        "```\n\n"
        "## 5. 内容结构\n"
        "```\n"
        "# 标题\n\n"
        "## 摘要\n"
        "核心定义/结论/关键信息，3-5 句话。\n\n"
        "## 核心内容\n"
        "按逻辑分节展开，引用原始资料。\n\n"
        "## 相关链接\n"
        "- [[相关概念1]]\n"
        "- [[相关概念2]]\n"
        "```\n\n"
        "## 6. 内部链接规则\n"
        "- 文中提及关键概念时，使用 [[页面名称]] 标注。\n"
        "- 每页至少 5 个内部链接。\n"
        "- 链接目标必须是 wiki/ 中已存在或本次编译产生的页面。\n\n"
        "## 7. 质量标准\n"
        "- 准确：所有内容必须有原文支撑，禁止幻觉。\n"
        "- 简洁：删除冗余信息，每句话必须有信息量。\n"
        "- 链接：[[内部链接]] 覆盖率 >50%。\n"
        "- 具体：优先保留数字、人名、时间、代码等具体信息。\n"
        "- 矛盾：若发现冲突信息，在对应位置标注 ⚠️。\n\n"
        "## 8. 更新规则\n"
        "- 新条目：直接创建新文件。\n"
        "- 已有条目更新：追加到 [[已有条目名]] 的 ## 更新日志 节，而非覆盖。\n\n"
        "## 9. 工作流\n"
        "raw/ → 分析 → 编译 → wiki/\n"
        "每个原始资料独立运行，不跨资料合并。"
    ),

    # ---- Ingest User Prompt（第二步：执行指令；第三步：原始资料）----
    "prompt_ingest_user": (
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
        "- 如果原始资料包含多个独立主题，请拆分为多个 wiki 页面\n\n"
        "## 原始资料\n\n"
        "来源：{source_url}\n"
        "类型：{content_type} → 建议 page_type：{page_type}\n"
        "原始标题：{title}\n\n"
        "---\n"
        "{raw_text}\n"
        "---\n\n"
        "{existing_knowledge}"
        "请输出 Markdown 维基页面："
    ),

    # ---- Query System（两步：回答 + 补充建议）----
    "prompt_query_system": (
        "你是一个知识助手，同时是知识库管理员（LLM Wiki）。\n\n"
        "两步工作：\n"
        "1. 回答问题：基于 wiki/ 中的已有资料准确回答\n"
        "2. 知识补充：判断 wiki/ 是否有遗漏，如果有必要补充，生成新 wiki 条目建议\n\n"
        "回答要求：\n"
        "- 综合多条已有知识，不要仅引用一条\n"
        "- 用中文回答，除非问题本身是英文\n"
        "- 如 wiki/ 不足以回答，诚实说明，不要编造\n"
        "- 禁止幻觉，所有断言必须有 wiki/ 资料支撑\n"
        "- 输出严格 JSON"
    ),
    "prompt_query_user": (
        "## 用户问题\n{question}\n\n"
        "## 知识库上下文（wiki/ 条目）\n"
        "---\n{context}\n---\n\n"
        "请严格输出 JSON：\n"
        "```json\n"
        "{\n"
        '  "answer": "完整回答（Markdown）",\n'
        '  "sources": ["[[条目名]]", ...],\n'
        '  "confidence": "high|medium|low",\n'
        '  "gaps": ["知识缺口描述"],\n'
        '  "backfill": {"title":"建议新条目","type":"concept","tags":["标签"],"summary":"50字","linked":["关联条目"]}\n'
        "}\n"
        "```"
    ),

    # ---- Lint System ----
    "prompt_lint_system": (
        "你是知识库审计员（LLM Wiki Auditor）。\n"
        "严格对照 SCHEMA v1.1 检查 wiki/ 整体质量。\n\n"
        "检查维度：\n"
        "1. 准确性：不同条目对同一事实的描述是否一致\n"
        "2. 时效性：是否存在过时信息（如旧版本号、过时数据）\n"
        "3. 完整性：是否存在重要概念缺失相关条目\n"
        "4. 链接密度：相关概念之间是否缺少 [[内部链接]]\n"
        "5. 格式合规：Frontmatter 是否包含 title/type/tags/created/source/linked\n"
        "6. 写作质量：摘要是否过于泛泛、要点是否缺乏细节\n"
        "7. 命名规范：文件名是否符合 lowercase-hyphen 规范\n\n"
        "评分标准（0-100）：\n"
        "90+: 高质量，知识密集，链接丰富，无矛盾\n"
        "70-89: 良好，有少量改进空间\n"
        "50-69: 一般，存在明显遗漏或质量问题\n"
        "<50: 需要大量重构\n\n"
        "输出严格 JSON。"
    ),
    "prompt_lint_user": (
        "## 知识库整体摘要\n"
        "---\n{all_summaries}\n---\n\n"
        "## 所有链接概念（共 {total_links} 个）\n"
        "{all_links}\n\n"
        "## 详细条目\n"
        "---\n{entry_text}\n---\n\n"
        "请严格输出 JSON：\n"
        "```json\n"
        "{\n"
        '  "score": 85,\n'
        '  "overall_assessment": "整体评估",\n'
        '  "issues": [\n'
        '    {"type":"contradiction|outdated|missing_link|low_quality|orphaned|bad_naming|bad_frontmatter",\n'
        '     "severity":"high|medium|low","title":"涉及条目","description":"问题描述","suggestion":"修改建议"}\n'
        '  ],\n'
        '  "improvements": ["改进建议1","改进建议2"]\n'
        "}\n"
        "```"
    ),
}


class Config:
    def __init__(self):
        self._data = DEFAULTS.copy()
        self._load()

    def _load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    self._data.update(json.load(f))
            except Exception:
                pass

    def save(self):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value

    def get_prompt(self, name):
        return self._data.get(name, "")

    def set_prompt(self, name, value):
        self._data[name] = value

    def get_schema_text(self):
        """读取 SCHEMA.md 文件内容（优先从 config 指定路径）"""
        schema_path = self.get("schema_path", SCHEMA_FILE)
        if os.path.exists(schema_path):
            try:
                with open(schema_path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                pass
        # 回退：使用内嵌版本
        return self.get_prompt("prompt_ingest_system")

    def list_prompts(self):
        return {k: v for k, v in self._data.items() if k.startswith("prompt_")}

    def page_types(self):
        return PAGE_TYPES

    def guess_page_type(self, content_type):
        return CONTENT_TYPE_TO_PAGE_TYPE.get(content_type, "note")
