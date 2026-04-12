"""
ingest/finder.py - 在 wiki/ 中查找相关内容
"""
import os, re
from pathlib import Path


def find_related(wiki_dir, title, limit=5):
    """根据标题关键词在 wiki/ 中找相关条目"""
    if not wiki_dir.exists():
        return []
    keywords = _extract_keywords(title)
    results = []
    for md_file in wiki_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8", errors="ignore")
        # 简单评分：标题包含关键词 or 正文提及
        score = 0
        for kw in keywords:
            if kw.lower() in md_file.stem.lower():
                score += 3
            if kw.lower() in content.lower():
                score += 1
        if score > 0:
            parsed = _parse_frontmatter(content)
            results.append({
                "file": str(md_file),
                "title": parsed.get("title", md_file.stem),
                "tags": parsed.get("tags", []),
                "summary": _extract_summary(content),
                "score": score,
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


def _extract_keywords(title):
    """从标题中提取关键词"""
    words = re.findall(r"[\w\u4e00-\u9fff]{2,}", title or "")
    stop = {"the", "and", "for", "with", "from", "about", "a", "an", "of", "to", "in", "on", "by"}
    return [w for w in words if w.lower() not in stop and len(w) > 1]


def _parse_frontmatter(content):
    """解析 YAML frontmatter"""
    meta = {}
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            block = content[4:end]
            for line in block.split("\n"):
                if line.startswith("tags:"):
                    continue
                if ": " in line or ":" in line:
                    key, val = (line.split(": ", 1) if ": " in line else line.split(":", 1))
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if val:
                        meta[key] = val
        except (ValueError, IndexError):
            pass
    return meta


def _extract_summary(content):
    """提取摘要段落"""
    # 去掉 frontmatter
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            body = content[end + 5:]
        except (ValueError, IndexError):
            body = content
    else:
        body = content
    # 取第一段或摘要 section
    match = re.search(r"(?:摘要|summary|## .*?摘要)", body, re.IGNORECASE)
    if match:
        start = match.end()
        next_head = re.search(r"\n## ", body[start:])
        end_pos = start + next_head.start() if next_head else start + 300
        return body[start:end_pos].strip()[:300]
    # 回退：取前200字
    paragraphs = re.split(r"\n\n+", body)
    for p in paragraphs:
        p = p.strip()
        if len(p) > 50 and not p.startswith("#"):
            return p[:200]
    return ""
