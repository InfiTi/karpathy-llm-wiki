"""lint: 知识库质量检查，扫描 wiki/ → LLM 评估 → 发现矛盾、过时、缺失"""
import os, re
from pathlib import Path


def run_lint(vault_path, llm_client, cfg=None):
    vault = Path(vault_path)

    # 确保三个目录存在
    (vault / "raw").mkdir(parents=True, exist_ok=True)
    wiki_dir = vault / "wiki"
    outputs_dir = vault / "outputs"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir.mkdir(parents=True, exist_ok=True)

    if not wiki_dir.exists() or not any(wiki_dir.glob("*.md")):
        return {"score": 0, "issues": [], "summary": "wiki/ 目录为空或不存在"}

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

    # 4. 从 config 读提示词（否则用 llm 默认）
    prompts = None
    if cfg:
        prompts = {
            "system": cfg.get_prompt("prompt_lint_system"),
            "user": cfg.get_prompt("prompt_lint_user"),
        }
    report = llm_client.lint(all_summaries, all_links, entries, prompts=prompts)

    # 5. 自动检测（不调用 LLM）
    auto_issues = _auto_check(entries)

    # 6. 保存报告到 outputs/
    _save_report(outputs_dir, report, auto_issues, entries)

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


def _save_report(outputs_dir, report, auto_issues, entries):
    date_str = __import__("datetime").datetime.now().strftime("%Y-%m-%d_%H%M%S")
    path = outputs_dir / f"lint-report-{date_str}.md"
    lines = [
        "---",
        f"title: 知识库质量报告",
        f"date: {date_str}",
        f"score: {report.get('score', '?')}",
        "---",
        "",
        f"# 知识库质量报告",
        "",
        f"**评分**: {report.get('score', '?')} / 100",
        f"**条目数**: {len(entries)}",
        "",
        f"## 整体评估",
        report.get("overall_assessment", ""),
        "",
        "## 自动检测问题",
    ]
    for issue in auto_issues:
        lines.append(f"- [{issue['severity'].upper()}] {issue['type']}: {issue['message']} (`{issue['file']}`)")
    lines.append("")
    lines.append("## AI 发现的问题")
    for issue in report.get("issues", []):
        lines.append(f"- [{issue.get('severity','?').upper()}] **{issue.get('type','')}** ({issue.get('title','')}): {issue.get('description','')}")
        if issue.get("suggestion"):
            lines.append(f"  → 建议: {issue['suggestion']}")
    lines.append("")
    lines.append("## 改进建议")
    for imp in report.get("improvements", []):
        lines.append(f"- {imp}")
    path.write_text("\n".join(lines), encoding="utf-8")


def _auto_check(entries):
    """自动质量检查（不调用 LLM）"""
    issues = []
    seen_titles = {}
    
    for e in entries:
        t_lower = e["title"].lower()
        
        # 1. 重复标题检查
        if t_lower in seen_titles:
            issues.append({
                "type": "duplicate",
                "severity": "high",
                "message": f"重复标题: '{e['title']}' 与 '{seen_titles[t_lower]}'",
                "file": e["file"],
            })
        else:
            seen_titles[t_lower] = e["title"]
    
    for e in entries:
        # 2. 内容完整性检查
        if not e["summary"] or len(e["summary"]) < 20:
            issues.append({
                "type": "empty_summary",
                "severity": "medium",
                "message": f"'{e['title']}' 摘要为空或过短",
                "file": e["file"],
            })
        
        # 3. 标签检查
        if not e["tags"]:
            issues.append({
                "type": "no_tags",
                "severity": "low",
                "message": f"'{e['title']}' 缺少标签",
                "file": e["file"],
            })
        
        # 4. 内容长度检查
        if len(e["body"]) < 500:
            issues.append({
                "type": "content_incomplete",
                "severity": "high",
                "message": f"'{e['title']}' 内容过短（{len(e['body'])} 字符），可能缺少核心内容",
                "file": e["file"],
            })
        
        # 5. 结构检查
        if not re.search(r"^##\s+", e["body"], re.MULTILINE):
            issues.append({
                "type": "structure_missing",
                "severity": "medium",
                "message": f"'{e['title']}' 缺少二级标题，结构不清晰",
                "file": e["file"],
            })
        
        # 6. 链接检查
        if len(e["links"]) < 5:
            issues.append({
                "type": "links_insufficient",
                "severity": "medium",
                "message": f"'{e['title']}' 内部链接不足（当前 {len(e['links'])} 个，建议至少 5 个）",
                "file": e["file"],
            })
        
        # 7. 核心内容检查
        if not re.search(r"核心观点|方法论|实战策略|案例分析", e["body"]):
            issues.append({
                "type": "core_content_missing",
                "severity": "medium",
                "message": f"'{e['title']}' 缺少核心观点、方法论或实战策略",
                "file": e["file"],
            })
        
        # 8. 营销内容检查
        if re.search(r"扫码预约|直播预约|年度成长|量身打造", e["body"]):
            issues.append({
                "type": "marketing_content",
                "severity": "high",
                "message": f"'{e['title']}' 包含营销内容，需要过滤",
                "file": e["file"],
            })
        
        # 9. 标题格式检查
        if e["title"] and (e["title"].startswith("《") or e["title"].startswith("【")):
            issues.append({
                "type": "title_format",
                "severity": "low",
                "message": f"'{e['title']}' 标题格式不规范，建议移除书名号或方括号",
                "file": e["file"],
            })
    
    return issues


def _parse(content):
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
                if in_tags and line.strip() and not line.strip().startswith(" "):
                    in_tags = False
                if ": " in line or ":" in line:
                    k_v = line.split(": ", 1) if ": " in line else line.split(":", 1)
                    val = k_v[1].strip().strip('"').strip("'")
                    if val:
                        meta[k_v[0].strip()] = val
            meta["tags"] = tags
        except (ValueError, IndexError):
            body = content
    links = re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", body)
    summary_match = re.search(r"## 摘要\s*(.+?)(?=\n##|\n#|$)", body, re.DOTALL)
    summary = summary_match.group(1).strip() if summary_match else ""
    return {"title": meta.get("title", ""), "tags": meta.get("tags", []),
            "summary": summary, "body": body, "links": links}
