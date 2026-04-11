"""query: 知识查询管道，用户提问 → 搜索 wiki/ → LLM 综合回答 + 回填"""
import os, re, datetime
from pathlib import Path


def run_query(question, vault_path, llm_client, cfg=None):
    vault = Path(vault_path)

    # 确保三个目录存在
    (vault / "raw").mkdir(parents=True, exist_ok=True)
    wiki_dir = vault / "wiki"
    outputs_dir = vault / "outputs"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    if not wiki_dir.exists() or not any(wiki_dir.glob("*.md")):
        raise ValueError(f"wiki/ 目录为空或不存在: {wiki_dir}")

    # 1. 搜索相关条目
    results = _search_wiki(wiki_dir, question)
    context = _build_context(results)

    # 2. 调用 LLM
    prompts = None
    if cfg:
        prompts = {
            "system": cfg.get_prompt("prompt_query_system"),
            "user": cfg.get_prompt("prompt_query_user"),
        }
    answer = llm_client.query(question, context, prompts=prompts)

    # 3. 保存回答到 outputs/
    answer_text = answer.get("answer", "")
    if answer_text:
        date_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
        safe_q = re.sub(r"[/\\:*?<>|]", "_", question[:40])
        out_path = outputs_dir / f"{date_str}_{safe_q}.md"
        out_lines = [
            "---",
            f'question: "{question}"',
            f"sources: [{','.join(answer.get('sources', []))}]",
            f"confidence: {answer.get('confidence', 'unknown')}",
            f"created: {datetime.datetime.now().isoformat()}",
            "---",
            "",
            f"# Q: {question}",
            "",
            answer_text,
        ]
        out_path.write_text("\n".join(out_lines), encoding="utf-8")

    # 4. 回填到 wiki/（如果有新知识建议）
    backfill = answer.get("backfill")
    if backfill:
        _write_backfill(wiki_dir, backfill)

    return answer


def _search_wiki(wiki_dir, question):
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
    title = backfill.get("title", "untitled")
    slug = re.sub(r"[/\\:*?<>|]", "-", title.strip())[:60]
    path = wiki_dir / f"{slug}.md"
    tags = backfill.get("tags", [])
    lines = [
        "---",
        f'title: "{title}"',
        f"created: {datetime.datetime.now().isoformat()}",
        "tags:",
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
    stop = {"the","and","for","with","from","about","a","an","of","to","in","on","by","what","how","why","is","are","can","do","this","that"}
    return [w for w in words if w.lower() not in stop]


def _parse_frontmatter(content):
    meta = {}
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            block = content[4:end]
            in_tags = False
            tags = []
            for line in block.split("\n"):
                if line.strip() == "tags:":
                    in_tags = True
                    continue
                if in_tags and line.strip().startswith("-"):
                    tags.append(line.strip()[1:].strip())
                    continue
                if in_tags and line.strip() and not line.strip().startswith(" "):
                    in_tags = False
                if ": " in line or ":" in line:
                    k_v = line.split(": ", 1) if ": " in line else line.split(":", 1)
                    val = k_v[1].strip().strip('"').strip("'")
                    if val:
                        meta[k_v[0].strip()] = val
            meta["tags"] = tags
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
