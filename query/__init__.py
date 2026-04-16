"""query: 知识查询管道，用户提问 → 搜索 wiki/ → LLM 综合回答 + 回填"""
import os, re, datetime
from pathlib import Path


def run_query(question, vault_path, llm_client, cfg=None, save_to_wiki=False):
    vault = Path(vault_path)

    # 确保三个目录存在
    (vault / "raw").mkdir(parents=True, exist_ok=True)
    wiki_dir = vault / "wiki"
    outputs_dir = vault / "outputs"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    if not wiki_dir.exists() or not any(wiki_dir.glob("*.md")):
        raise ValueError(f"wiki/ 目录为空或不存在: {wiki_dir}")

    # 搜索相关条目
    results = _search_wiki(wiki_dir, question)
    
    context = _build_context(results)

    # 4. 调用 LLM
    prompts = None
    if cfg:
        prompts = {
            "system": cfg.get_prompt("prompt_query_system"),
            "user": cfg.get_prompt("prompt_query_user"),
        }
    answer = llm_client.query(question, context, prompts=prompts)

    # 添加质量评估和来源信息
    answer["quality_score"] = answer.get("quality_score", 0)
    answer["suggest_save"] = answer.get("suggest_save", False)
    answer["derived_from"] = answer.get("derived_from", [r["title"] for r in results[:3]])

    # 5. 保存回答到 outputs/
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
            f"quality_score: {answer.get('quality_score', 0)}",
            f"suggest_save: {answer.get('suggest_save', False)}",
            f"derived_from: [{','.join(answer.get('derived_from', []))}]",
            f"created: {datetime.datetime.now().isoformat()}",
            "---",
            "",
            f"# Q: {question}",
            "",
            answer_text,
        ]
        out_path.write_text("\n".join(out_lines), encoding="utf-8")

    # 6. 回填到 wiki/（如果有新知识建议）
    backfill = answer.get("backfill")
    if backfill:
        _write_backfill(wiki_dir, backfill)

    # 7. 保存到 Wiki（如果请求）
    if save_to_wiki:
        wiki_path = _write_query_to_wiki(wiki_dir, question, answer, answer.get("derived_from", []))
        answer["saved_to_wiki"] = wiki_path

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


def _build_context(results, max_tokens=4000):
    """
    构建智能上下文
    
    Args:
        results: 搜索结果列表
        max_tokens: 最大 token 数（估算）
    
    Returns:
        构建好的上下文字符串
    """
    if not results:
        return "（知识库为空，没有找到相关信息）"
    
    def estimate_tokens(text):
        return len(text) // 2
    
    blocks = []
    total_tokens = 0
    
    for r in results:
        score = r.get('score', 0)
        
        title = r.get('title', 'Unknown')
        tags = r.get('tags', [])
        summary = r.get('summary', '')[:300]
        content = r.get('content', '')[:500]
        
        block = f"### [[{title}]]\n"
        block += f"标签: {', '.join(tags)}\n"
        if score > 0:
            block += f"相关度: {score}\n"
        block += f"{summary}\n{content}"
        
        block_tokens = estimate_tokens(block)
        
        if total_tokens + block_tokens > max_tokens:
            break
        
        blocks.append(block)
        total_tokens += block_tokens
    
    context = "\n\n---\n\n".join(blocks)
    
    context += f"\n\n---\n\n[共 {len(blocks)} 个相关知识条目]"
    
    return context


def _write_backfill(wiki_dir, backfill):
    title = backfill.get("title", "untitled")
    slug = re.sub(r'[\\/:*?<>|"\']', "-", title.strip())[:60]
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


def _write_query_to_wiki(wiki_dir, question, answer, derived_from):
    """保存 Query 答案到 Wiki"""
    # 从答案中提取标题
    title = answer.get("title", question[:60])
    slug = re.sub(r'[\\/:*?<>|"\']', "-", title.strip())[:60]
    path = wiki_dir / f"{slug}.md"
    
    # 提取标签（从答案或来源中）
    tags = answer.get("tags", ["query-generated"])
    
    # 构建内容
    lines = [
        "---",
        f'title: "{title}"',
        f"created: {datetime.datetime.now().isoformat()}",
        "tags:",
    ]
    for tag in tags:
        lines.append(f"  - {tag}")
    lines.append("source: query-generated")
    lines.append(f"original_question: \"{question}\"")
    lines.append(f"derived_from: [{','.join(derived_from)}]")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## 原始问题")
    lines.append(question)
    lines.append("")
    lines.append("## 答案")
    lines.append(answer.get("answer", ""))
    
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def _extract_keywords(text):
    # 提取中文词汇和英文单词
    # 1. 提取连续的中文词汇（2个或更多字符）
    # 2. 提取英文单词
    # 3. 提取单个中文字符作为补充
    import re
    
    # 提取连续的中文词汇（2个或更多字符）
    chinese_terms = re.findall(r"[\u4e00-\u9fff]{2,}", text)
    
    # 提取英文单词
    english_words = re.findall(r"[a-zA-Z]{2,}", text)
    
    # 提取单个中文字符作为补充
    chinese_chars = re.findall(r"[\u4e00-\u9fff]", text)
    
    # 合并所有关键词
    all_words = chinese_terms + english_words + chinese_chars
    
    # 过滤停用词
    stop = {"the","and","for","with","from","about","a","an","of","to","in","on","by","what","how","why","is","are","can","do","this","that","什么","是","的","了","在","有","和","我","他","她","它","们"}
    
    # 去重并返回
    return list(set([w for w in all_words if w.lower() not in stop]))


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
