"""
lint: 知识库质量检查
扫描 wiki/ → LLM 评估 → 发现矛盾、过时、缺失
"""
import os, re
from pathlib import Path


def run_lint(vault_path, llm_client):
    """
    主入口：扫描整个 wiki/，返回质量报告
    """
    wiki_dir = Path(vault_path) / "wiki"
    if not wiki_dir.exists():
        raise ValueError(f"wiki/ 目录不存在: {wiki_dir}")

    # 1. 读取所有 wiki 条目
    entries = []
    for md_file in wiki_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8", errors="ignore")
        parsed = _parse(content)
        if parsed.get("title"):
            entries.append({
                "file": str(md_file),
                "title": parsed.get("title", md_file.stem),
                "tags": parsed.get("tags", []),
                "summary": parsed.get("summary", ""),
                "body": parsed.get("body", ""),
                "links": parsed.get("links", []),
                "raw": content,
            })

    if not entries:
        return {"score": 0, "issues": [], "summary": "wiki/ 为空"}

    # 2. 收集所有内容摘要构建全局上下文
    all_summaries = "\n\n".join(
        f"### {e['title']}\n标签: {', '.join(e['tags'])}\n{e['summary']}"
        for e in entries
    )

    # 3. 收集所有 wikilinks
    all_links = set()
    for e in entries:
        for link in e["links"]:
            all_links.add(link.strip("[[]]").lower())

    # 4. 调用 LLM 做质量分析
    report = llm_client.lint(all_summaries, all_links, entries)

    # 5. 补充自动检测（不调用 LLM）
    auto_issues = _auto_check(entries)

    return {
        "score": report.get("score", "?"),
        "issues": report.get("issues", []) + auto_issues,
        "report": report,
        "stats": {
            "total_entries": len(entries),
            "total_links": len(all_links),
            "auto_issues": len(auto_issues),
        },
    }


def _auto_check(entries):
    """自动检测一些明显问题（不需要 LLM）"""
    issues = []
    seen_titles = {}
    for e in entries:
        t_lower = e["title"].lower()
        if t_lower in seen_titles:
            issues.append({
                "type": "duplicate",
                "severity": "high",
                "message": f"存在重复标题: '{e['title']}' 与 '{seen_titles[t_lower]}'",
                "file": e["file"],
            })
        else:
            seen_titles[t_lower] = e["title"]

    for e in entries:
        if not e["summary"] or len(e["summary"]) < 20:
            issues.append({
                "type": "empty_summary",
                "severity": "medium",
                "message": f"'{e['title']}' 摘要为空或过短",
                "file": e["file"],
            })
        if not e["tags"]:
            issues.append({
                "type": "no_tags",
                "severity": "low",
                "message": f"'{e['title']}' 缺少标签",
                "file": e["file"],
            })
    return issues


def _parse(content):
    """解析单个 wiki 条目"""
    meta = {}
    body = content
    if content.startswith("---"):
        try:
            end = content.index("\n---\n")
            meta_block = content[4:end]
            body = content[end + 5:]
            in_tags = False
            tags = []
            for line in meta_block.split("\n"):
                if line.strip() == "tags:":
                    in_tags = True
                    continue
                if in_tags and line.strip().startswith("-"):
                    tags.append(line.strip()[1:].strip())
                    continue
                if in_tags and line.strip() and not line.startswith(" "):
                    in_tags = False
                if ": " in line or ":" in line:
                    k_v = line.split(": ", 1) if ": " in line else line.split(":", 1)
                    key, val = k_v[0].strip(), k_v[1].strip().strip('"').strip("'")
                    if val:
                        meta[key] = val
            meta["tags"] = tags
        except (ValueError, IndexError):
            body = content

    links = re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", body)
    # 提取摘要
    summary_match = re.search(r"## 摘要\s*(.+?)(?=\n##|\n#|$)", body, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else ""

    return {
        "title": meta.get("title", ""),
        "tags": meta.get("tags", []),
        "summary": summary,
        "body": body,
        "links": links,
    }
