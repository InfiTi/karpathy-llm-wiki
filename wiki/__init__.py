"""
wiki: SCHEMA v1.1 格式写入工具
- Frontmatter: title / type / tags / created / source / linked（6 字段必填）
- 内容结构: # 标题 → ## 摘要 → ## 核心内容 → ## 相关链接
- 命名规范: lowercase-hyphen
"""
import os, re, datetime
from pathlib import Path

PAGE_TYPES = ["concept", "paper", "person", "tool", "dataset", "note"]


def write_wiki_entry(vault_path, md_content, source_url="", page_type="note"):
    """
    将 Markdown 内容写入 wiki/ 目录。

    参数:
        vault_path  - Obsidian vault 根目录
        md_content  - 已编译的 Markdown 字符串（可含 frontmatter）
        source_url  - 来源 URL（写入 frontmatter.source）
        page_type   - 页面类型（concept/paper/person/tool/dataset/note）

    返回:
        写入的文件路径（字符串）
    """
    wiki_dir = Path(vault_path) / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)

    # 解析或补充 frontmatter
    md_content = _ensure_frontmatter(md_content, page_type, source_url)

    # 从内容中提取标题用于文件名
    title_match = re.search(r"^#\s+(.+)$", md_content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "untitled"

    # SCHEMA 命名：lowercase-hyphen
    slug = _slugify(title)
    wiki_path = wiki_dir / f"{slug}.md"
    wiki_path.write_text(md_content, encoding="utf-8")
    return str(wiki_path)


def _slugify(title):
    """lowercase-hyphen 转换"""
    s = re.sub(r"[\s/\\:#*?\"<>|]+", "-", title.strip())
    s = re.sub(r"-+", "-", s)
    return s.strip("-").lower()[:80] or "untitled"


def _ensure_frontmatter(md_text, default_type, source_url):
    """确保包含完整 6 字段 frontmatter（SCHEMA v1.1 规范）"""
    meta, body = _parse_frontmatter(md_text)

    # 标题
    title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    if not meta.get("title") and title_match:
        meta["title"] = title_match.group(1).strip()
    if not meta.get("title"):
        meta["title"] = "untitled"

    # 页面类型
    if not meta.get("type") or meta["type"] not in PAGE_TYPES:
        meta["type"] = default_type if default_type in PAGE_TYPES else "note"

    # 链接
    wikilinks = re.findall(r"\[\[([^\]|]+?)\]\]", body)
    if not meta.get("linked"):
        meta["linked"] = wikilinks[:10]
    elif wikilinks:
        existing = set(str(l) for l in meta.get("linked", []))
        for link in wikilinks[:10]:
            existing.add(link)
        meta["linked"] = list(existing)[:20]

    # 时间戳
    if not meta.get("created"):
        meta["created"] = datetime.datetime.now().strftime("%Y-%m-%d")

    # 来源
    if not meta.get("source"):
        meta["source"] = source_url or ""

    # 重建 frontmatter
    fm_lines = ["---"]
    fm_lines.append(f'title: "{meta["title"]}"')
    fm_lines.append(f"type: {meta['type']}")
    fm_lines.append("tags:")
    for tag in (meta.get("tags") or []):
        fm_lines.append(f"  - {tag}")
    fm_lines.append(f"created: {meta['created']}")
    fm_lines.append(f"source: {meta['source']}")
    if meta.get("linked"):
        linked_str = "[" + ", ".join(f'"{l}"' for l in meta["linked"]) + "]"
        fm_lines.append(f"linked: {linked_str}")
    fm_lines.append("---\n")

    return "".join(fm_lines) + body


def _parse_frontmatter(md_text):
    """解析 YAML frontmatter"""
    meta = {}
    body = md_text
    if md_text.strip().startswith("---"):
        try:
            end = md_text.index("\n---\n", 4)
            block = md_text[4:end]
            body = md_text[end + 5:]

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
                    meta["type"] = val
                elif key == "created":
                    meta["created"] = val
                elif key == "source":
                    meta["source"] = val
                elif key == "linked":
                    linked_str = val.strip("[]")
                    meta["linked"] = [x.strip().strip('"') for x in linked_str.split(",") if x.strip()]
            meta["tags"] = tags
        except (ValueError, IndexError):
            body = md_text
    return meta, body
