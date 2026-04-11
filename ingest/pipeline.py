"""ingest/pipeline.py - 核心摄入逻辑"""
import os, json, re, datetime
from pathlib import Path
from .finder import find_related


def run_ingest(vault_path, content, source_url, content_type, title, llm_client, cfg=None):
    vault = Path(vault_path)

    # 确保三个目录都存在
    raw_dir = vault / "raw"
    wiki_dir = vault / "wiki"
    outputs_dir = vault / "outputs"
    for d in [raw_dir, wiki_dir, outputs_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # 1. 保存原始内容到 raw/
    date_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe = re.sub(r"[/\\:*?<>|]", "_", (title or "untitled")[:60])
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

    # 2. 查找相关条目
    related = find_related(wiki_dir, title)

    # 3. 构建已有知识上下文
    existing_info = ""
    if related:
        existing_info = "## 知识库已有条目（请合并）：\n"
        for entry in related[:3]:
            existing_info += f"\n### {entry['title']}\n{entry['summary'][:300]}\n"

    # 4. LLM 摄入（从 config 读提示词）
    prompts = None
    if cfg:
        prompts = {
            "system": cfg.get_prompt("prompt_ingest_system"),
            "user": cfg.get_prompt("prompt_ingest_user"),
        }
    refined = llm_client.ingest(
        raw_text=content,
        content_type=content_type,
        title=title,
        source_url=source_url,
        existing_knowledge=existing_info,
        prompts=prompts,
    )

    # 5. 写 wiki/ 条目
    from wiki import write_wiki_entry
    wiki_path = write_wiki_entry(vault_path, refined, source_url)
    return {"raw": str(raw_path), "wiki": wiki_path}
