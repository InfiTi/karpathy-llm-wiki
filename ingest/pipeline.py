"""ingest/pipeline.py - SCHEMA 模式核心摄入逻辑
流程：raw/（只读）→ LLM 按 SCHEMA 编译 → wiki/（Markdown 维基页面）
"""
import os, re, datetime
from pathlib import Path
from .finder import find_related

# 6 种固定页面类型（来自 SCHEMA v1.1）
PAGE_TYPES = ["concept", "paper", "person", "tool", "dataset", "note"]


def run_ingest(vault_path, content, source_url, content_type, title,
               llm_client, cfg=None):
    """
    SCHEMA v1.1 工作流：
    raw/ → 分析 → 编译（SCHEMA → 指令 → 内容）→ wiki/
    """
    vault = Path(vault_path)

    # 确保目录存在（SCHEMA 规定：raw/ 只读，wiki/ 输出，schema/ 规则）
    raw_dir = vault / "raw"
    wiki_dir = vault / "wiki"
    schema_dir = vault / "schema"
    outputs_dir = vault / "outputs"
    for d in [raw_dir, wiki_dir, schema_dir, outputs_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # 1. 保存原始内容到 raw/（只读）
    date_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe = re.sub(r"[\\/:*?\"<>|]", "_", (title or "untitled")[:60])
    raw_name = f"{date_str}_{safe}.md"
    raw_path = raw_dir / raw_name
    body_lines = [
        "---",
        f"title: {title or 'untitled'}",
        f"source: {source_url}",
        f"type: {content_type}",
        f"created: {datetime.datetime.now().isoformat()}",
        "---",
        "",
        f"# {title or 'Untitled'}",
        "",
        content,
    ]
    raw_path.write_text("\n".join(body_lines), encoding="utf-8")

    # 2. 判断 page_type（根据 content_type 推断）
    page_type = "note"
    if cfg:
        page_type = cfg.guess_page_type(content_type)

    # 3. 读取 SCHEMA.md 内容（第一步）
    schema_text = ""
    if cfg:
        schema_text = cfg.get_schema_text()

    # 4. 查找相关条目（用于增量合并）
    related = find_related(wiki_dir, title)
    existing_info = ""
    if related:
        existing_info = "## 知识库已有条目（请合并或追加到更新日志）：\n"
        for entry in related[:3]:
            existing_info += f"\n### [[{entry['title']}]]\n{entry['summary'][:500]}\n"

    # 5. LLM 编译（SCHEMA 模式：直接返回 Markdown）
    user_instructions = (
        f"- 本次推荐 page_type：{page_type}（来自 content_type={content_type}）\n"
        "- 如果原始资料包含多个主题，拆分为多个 wiki 页面\n"
    )

    md_output = llm_client.ingest(
        raw_text=content,
        content_type=content_type,
        title=title,
        source_url=source_url,
        page_type=page_type,
        schema_text=schema_text,
        existing_knowledge=existing_info,
        user_instructions=user_instructions,
    )

    # 6. 解析 LLM 返回的 Markdown，写入 wiki/
    wiki_paths = _write_markdown_pages(wiki_dir, md_output, source_url, page_type)

    return {
        "raw": str(raw_path),
        "wiki": wiki_paths,
    }


def _slugify(title):
    """将标题转换为 lowercase-hyphen 文件名（SCHEMA 命名规范）"""
    # 去除 URL 和特殊字符，保留字母数字中文
    s = title.strip()
    s = re.sub(r"^-+|-+$", "", s)
    # 空格变短横线，删除其他特殊字符
    s = re.sub(r"[\s/\\:#*?\"<>|]+", "-", s)
    s = re.sub(r"-+", "-", s)
    # 限制长度
    return s[:80].lower()


def _parse_md_frontmatter(md_text):
    """
    解析 Markdown 中的 YAML frontmatter。
    返回 (frontmatter_dict, body_without_frontmatter)
    """
    meta = {"title": "", "type": "note", "tags": [], "created": "", "source": "", "linked": []}
    body = md_text

    if md_text.strip().startswith("---"):
        try:
            first_end = md_text.index("\n---\n", 4)
            block = md_text[4:first_end]
            body = md_text[first_end + 5:]

            in_tags = False
            tags = []
            for line in block.split("\n"):
                ls = line.strip()
                if ls == "tags:":
                    in_tags = True
                    continue
                if in_tags:
                    if ls.startswith("-"):
                        tags.append(ls.lstrip("-").strip())
                        continue
                    elif ls and not ls.startswith(" ") and ":" not in ls:
                        in_tags = False
                if ": " in line:
                    k, v = line.split(": ", 1)
                elif ":" in line:
                    k, v = line.split(":", 1)
                else:
                    continue
                key = k.strip().lower()
                val = v.strip().strip('"').strip("'")
                if key == "title":
                    meta["title"] = val
                elif key == "type":
                    if val in PAGE_TYPES:
                        meta["type"] = val
                elif key == "tags":
                    pass  # tags handled above
                elif key == "created":
                    meta["created"] = val
                elif key == "source":
                    meta["source"] = val
                elif key == "linked":
                    # linked: [a, b] or linked: a, b
                    linked_str = val.strip("[]")
                    meta["linked"] = [x.strip() for x in linked_str.split(",") if x.strip()]
            meta["tags"] = tags
        except (ValueError, IndexError):
            body = md_text

    return meta, body


def _ensure_frontmatter(md_text, page_type, source_url):
    """
    确保 Markdown 有完整 frontmatter（SCHEMA 规定必填字段）。
    如果 LLM 没输出 frontmatter，自动补充。
    """
    meta, body = _parse_md_frontmatter(md_text)

    # 从 body 中提取标题（第一个 # 标题）
    title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    if not meta["title"] and title_match:
        meta["title"] = title_match.group(1).strip().strip("#").strip()

    # 从 body 中提取 [[链接]]
    wikilinks = re.findall(r"\[\[([^\]|]+?)\]\]", body)
    if not meta["linked"]:
        meta["linked"] = wikilinks[:10]

    # 补充缺失字段
    if not meta["created"]:
        meta["created"] = datetime.datetime.now().strftime("%Y-%m-%d")
    if not meta["type"]:
        meta["type"] = page_type
    if not meta["source"]:
        meta["source"] = source_url or ""

    # 重建 frontmatter
    fm_lines = [
        "---",
        f'title: "{meta["title"]}"',
        f"type: {meta['type']}",
        "tags:",
    ]
    for tag in (meta["tags"] or []):
        fm_lines.append(f"  - {tag}")
    fm_lines.append(f"created: {meta['created']}")
    fm_lines.append(f"source: {meta['source']}")
    if meta["linked"]:
        linked_str = "[" + ", ".join(f'"{l}"' for l in meta["linked"]) + "]"
        fm_lines.append(f"linked: {linked_str}")
    fm_lines.append("---\n")

    return "".join(fm_lines) + body


def _count_wikilinks(md_text):
    """统计 Markdown 中的 [[内部链接]] 数量"""
    return len(re.findall(r"\[\[[^\]]+\]\]", md_text))


def _write_markdown_pages(wiki_dir, md_output, source_url, default_type):
    """
    将 LLM 返回的 Markdown 写入 wiki/ 目录。
    - 支持多页面（LLM 输出包含多个 markdown 块时）
    - 自动添加 frontmatter
    - 自动命名文件（lowercase-hyphen）
    - 检查 [[链接]] 数量
    """
    pages = _split_markdown_pages(md_output)
    written = []

    for page_md in pages:
        page_md = page_md.strip()
        if not page_md or len(page_md) < 20:
            continue

        # 确保 frontmatter 完整
        page_md = _ensure_frontmatter(page_md, default_type, source_url)

        # 提取标题作为文件名
        title_match = re.search(r"^#\s+(.+)$", page_md, re.MULTILINE)
        if not title_match:
            continue
        title = title_match.group(1).strip()

        # SCHEMA 命名规范：lowercase-hyphen
        slug = _slugify(title)
        if not slug:
            slug = "untitled-page"

        wiki_path = wiki_dir / f"{slug}.md"
        wiki_path.write_text(page_md, encoding="utf-8")
        written.append(str(wiki_path))

    return written


def _split_markdown_pages(md_text):
    """
    拆分 LLM 输出中的多个页面。
    识别方式：
    1. 顶级分割标记（如 ---page--- 或 #---）
    2. 多个顶级 # 标题块
    """
    # 尝试用特殊分隔符分割
    separators = [
        r"\n---\s*\n(?=# )",      # --- 后跟 # 标题
        r"\n====\s*\n(?=# )",     # === 后跟 # 标题
        r"\n\n(?=# [^#])",        # 两个换行后跟 # 标题（非子标题）
    ]

    for sep in separators:
        parts = re.split(sep, md_text)
        if len(parts) > 1:
            return parts

    # 如果没有明显分割，检查是否包含多个一级标题
    headings = list(re.finditer(r"^# [^#]", md_text, re.MULTILINE))
    if len(headings) > 1:
        parts = []
        for i, m in enumerate(headings):
            start = m.start()
            end = headings[i + 1].start() if i + 1 < len(headings) else len(md_text)
            parts.append(md_text[start:end])
        return parts

    return [md_text]
