"""
wiki: Obsidian wiki 写入工具
写入位置：vault/wiki/ 子目录
"""
import os, re, datetime
from pathlib import Path


def write_wiki_entry(vault_path, data, source_url, filename_hint=""):
    """
    将结构化数据写入 vault/wiki/ 目录

    data = {
        "title": "...",
        "tags": [...],
        "summary": "...",
        "key_points": [...],
        "wikilinks": [...],
        "metadata": {...}
    }
    """
    wiki_dir = Path(vault_path) / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)

    title = data.get("title", filename_hint or "untitled")
    slug = re.sub(r"[\\/:*?\"<>|\s]+", "-", title.strip())[:60]
    wiki_path = wiki_dir / f"{slug}.md"

    tags = data.get("tags", [])
    summary = data.get("summary", "")
    key_points = data.get("key_points", [])
    related = data.get("wikilinks", [])
    meta = data.get("metadata", {})

    lines = [
        "---",
        f'title: "{title}"',
        f"created: {datetime.datetime.now().isoformat()}",
        "tags:",
    ]
    for tag in tags:
        lines.append(f"  - {tag}")
    lines.append(f"source: {source_url or ''}")
    if meta.get("uploader"):
        lines.append(f"uploader: {meta['uploader']}")
    if meta.get("duration"):
        lines.append(f"duration: {meta['duration']}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    if summary:
        lines.append(f"## 摘要\n{summary}")
        lines.append("")
    if key_points:
        lines.append("## 核心要点\n")
        for pt in key_points:
            lines.append(f"- {pt}")
        lines.append("")
    if related:
        lines.append("## 相关概念\n")
        for r in related[:10]:
            safe = re.sub(r"[\\/:*?\"<>|]", "", r)
            lines.append(f"- [[{safe}]]")
        lines.append("")
    if source_url:
        lines.append(f"\n---\n**来源**: {source_url}")

    wiki_path.write_text("\n".join(lines), encoding="utf-8")
    return str(wiki_path)
