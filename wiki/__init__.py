
"""wiki: Obsidian wiki 文件写入"""
import os, re
from datetime import datetime

def slugify(title):
    s = re.sub(r"[\\/:*?\"<>|]", "", title)
    s = re.sub(r"\s+", "-", s)
    return s.strip("-") or "untitled"

class WikiWriter:
    def __init__(self, vault_path):
        self.vault = vault_path

    def write(self, refined_data, source_url=""):
        title = refined_data.get("title") or "untitled"
        tags = refined_data.get("tags") or []
        summary = refined_data.get("summary") or ""
        key_points = refined_data.get("key_points") or []
        wikilinks = refined_data.get("wikilinks") or []
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        safe_title = title.replace('"', '\\"')
        tags_str = "\n  - ".join(tags) if tags else ""
        source_str = f"\n  source: {source_url}" if source_url else ""
        frontmatter = (
            f"---\n"
            f'title: "{safe_title}"\n'
            f"created: {date_str}\n"
            f"tags:\n"
            f"  - {tags_str}{source_str}\n"
            f"---\n\n"
        )
        body = [f"# {title}\n"]
        if summary:
            body.append(f"## 摘要\n{summary}\n")
        if key_points:
            body.append("## 核心要点\n")
            for pt in key_points:
                body.append(f"- {pt}")
            body.append("")
        if wikilinks:
            body.append("## 相关概念\n")
            for link in wikilinks[:10]:
                body.append(f"- [[{link}]]")
            body.append("")
        if source_url:
            body.append(f"\n---\n**来源**: {source_url}\n")
        content = frontmatter + "\n".join(body)
        slug = slugify(title)[:80]
        filename = f"{slug}.md"
        filepath = os.path.join(self.vault, filename)
        counter = 1
        while os.path.exists(filepath):
            filename = f"{slug}-{counter}.md"
            filepath = os.path.join(self.vault, filename)
            counter += 1
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return filepath
