"""
query: 知识查询管道
用户提问 → 搜索 wiki/ → LLM 综合回答 + 回填
"""
import os, re, datetime
from pathlib import Path


def run_query(question, vault_path, llm_client):
    """
    主入口：回答一个问题，参考 wiki/ 中的知识
    """
    wiki_dir = Path(vault_path) / "wiki"
    if not wiki_dir.exists():
        raise ValueError(f"wiki/ 目录不存在: {wiki_dir}")

    # 1. 搜索相关条目
    results = _search_wiki(wiki_dir, question)
    context = _build_context(results)

    # 2. 调用 LLM
    answer = llm_client.query(question, context)

    # 3. 如果 LLM 建议补充新知识，回填到 wiki/
    backfill = answer.get("backfill")
    if backfill:
        _write_backfill(wiki_dir, backfill)

    return answer


def _search_wiki(wiki_dir, question):
    """基于关键词搜索 wiki/"""
    keywords = _extract_keywords(question)
    results = []
    for md_file in wiki_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8", errors="ignore")
        score = 0
        stem = md_file.stem.lower()
        for kw in keywords:
            if kw.lower() in stem:
                score += 5
            if kw.lower() in content.lower():
                score += 1
        if score > 0:
            parsed = _parse_frontmatter(content)
            results.append({
                "file": str(md_file),
                "title": parsed.get("title", md_file.stem),
                "tags": parsed.get("tags", []),
                "summary": _extract_summary(content),
                "content": _extract_key_content(content, keywords),
                "score": score,
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:8]


def _build_context(results):
    """把搜索结果构建为 LLM 上下文"""
    if not results:
        return "（知识库为空，没有找到相关信息）"
    blocks = []
    for r in results:
        blocks.append(
            f"### [[{r['title']}]]\n"
            f"标签: {', '.join(r.get('tags', []))}\n"
            f"{r.get('summary', '')[:300]}\n"
            f"{r.get('content', '')[:500]}"
        )
    return "\n\n---\n\n".join(blocks)


def _write_backfill(wiki_dir, backfill):
    """将 LLM 生成的新知识写回 wiki/"""
    title = backfill.get("title", "untitled")
    slug = re.sub(r"[\\\\/:*?\"<>|\\s]+", "-", title.strip())[:60]
    path = wiki_dir / f"{slug}.md"
    tags = backfill.get("tags", [])
    lines = [
        "---",
        f'title: "{title}"',
        f'created: {datetime.datetime.now().isoformat()}',
        f'tags:',
    ]
    for tag in tags:
        lines.append(f"  - {tag}")
    lines.append("source: query-backfill")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    if backfill.get("summary"):
        lines.append(f"\n## 摘要\n{backfill['summary']}\n")
    if backfill.get("key_points"):
        lines.append("## 核心要点\n")
        for pt in backfill["key_points"]:
            lines.append(f"- {pt}")
    path.write_text("\n".join(lines), encoding="utf-8")


def _extract_keywords(text):
    words = re.findall(r"[\w\u4e00-\u9fff]{2,}", text)
    stop = {"the", "and", "for", "with", "from", "about", "a", "an", "of", "to", "in", "on", "by", "what", "how", "why", "is", "are", "can"}
    return [w for w in words if w.lower() not in stop]


def _parse_frontmatter(content):
    meta = {}
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            block = content[4:end]
            for line in block.split("\n"):
                if line.startswith("tags:") or line.strip().startswith("-"):
                    continue
                if ": " in line or ":" in line:
                    key, val = (line.split(": ", 1) if ": " in line else line.split(":", 1))
                    val = val.strip().strip('"').strip("'")
                    if val:
                        meta[key.strip()] = val
        except (ValueError, IndexError):
            pass
    return meta


def _extract_summary(content):
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            body = content[end + 5:]
        except ValueError:
            body = content
    else:
        body = content
    match = re.search(r"(?:摘要|summary|## .*?摘要)", body, re.IGNORECASE)
    if match:
        start = match.end()
        next_head = re.search(r"\n## ", body[start:])
        end_pos = start + (next_head.start() if next_head else 300)
        return body[start:end_pos].strip()[:300]
    return ""


def _extract_key_content(content, keywords, max_chars=500):
    """提取包含关键词的段落"""
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            body = content[end + 5:]
        except ValueError:
            body = content
    else:
        body = content
    paragraphs = re.split(r"\n\n+", body)
    relevant = [p.strip() for p in paragraphs
                if any(kw.lower() in p.lower() for kw in keywords)
                and len(p.strip()) > 30]
    result = "\n\n".join(relevant)
    return result[:max_chars] if result else ""
