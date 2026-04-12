"""ingest/pipeline.py - SCHEMA 模式核心摄入逻辑
流程：raw/（只读）→ LLM 按 SCHEMA 编译 → wiki/（Markdown 维基页面）
"""
import os, re, datetime
from pathlib import Path
from .finder import find_related

# 6 种固定页面类型（来自 SCHEMA v1.1）
PAGE_TYPES = ["concept", "paper", "person", "tool", "dataset", "note"]


def _slugify(title):
    """将标题转换为 lowercase-hyphen 文件名（SCHEMA 命名规范）"""
    # 去除 URL 和特殊字符，保留字母数字中文
    s = title.strip()
    s = re.sub(r"^-+|-+$", "", s)
    # 空格变短横线，删除其他特殊字符
    s = re.sub(r"[\s/\\:#*?\"<>|]+", "-", s)
    s = re.sub(r"-+", "-", s)
    # 限制长度
    return s[:80].lower()


def _clean_wikilink(link):
    """清理和修复 wiki 链接格式"""
    link = link.strip()
    # 移除可能的方括号
    link = link.strip('[]')
    # 移除可能的管道符和显示文本
    if '|' in link:
        link = link.split('|')[0].strip()
    return link


def _filter_marketing_content(text):
    """过滤营销内容"""
    # 移除直播预约等营销内容
    marketing_patterns = [
        r'欢迎关注.*直播.*扫码预约.*',
        r'扫码预约.*不错过',
        r'[0-9]+年一线实战.*量身打造.*',
        r'年度成长与财富守护圈'
    ]
    for pattern in marketing_patterns:
        text = re.sub(pattern, '', text, flags=re.DOTALL)
    return text


def _remove_duplicate_content(text):
    """移除重复内容，特别是总结部分"""
    lines = text.split('\n')
    seen_content = set()
    result_lines = []
    
    for line in lines:
        stripped = line.strip()
        # 如果是空行，直接保留
        if not stripped:
            result_lines.append(line)
            continue
        
        # 检查是否是列表项（以数字或-开头）
        is_list_item = re.match(r'^(\d+\.|-)\s+', stripped)
        if is_list_item:
            # 对于列表项，提取核心内容（去掉序号和开头空格）
            core_content = re.sub(r'^(\d+\.|-)\s+', '', stripped)
            core_content = core_content.strip()
            if core_content and core_content not in seen_content:
                seen_content.add(core_content)
                result_lines.append(line)
        else:
            # 对于普通行，检查是否有重复
            if stripped not in seen_content:
                seen_content.add(stripped)
                result_lines.append(line)
    
    return '\n'.join(result_lines)


def _parse_md_frontmatter(md_text):
    """
    解析 Markdown 中的 YAML frontmatter。
    返回 (frontmatter_dict, body_without_frontmatter)
    """
    meta = {"title": "", "type": "note", "tags": [], "created": "", "source": "", "linked": []}
    body = md_text

    print(f"[DEBUG] _parse_md_frontmatter 开始，输入长度: {len(md_text)}")
    if md_text.strip().startswith("---"):
        print(f"[DEBUG] 检测到 frontmatter 开始标记")
        try:
            # 更健壮的方式找到 frontmatter 结束位置
            lines = md_text.split('\n')
            start_idx = 0
            while start_idx < len(lines) and lines[start_idx].strip() != "---":
                start_idx += 1
            print(f"[DEBUG] frontmatter 开始行: {start_idx}")
            if start_idx < len(lines):
                end_idx = start_idx + 1
                while end_idx < len(lines) and lines[end_idx].strip() != "---":
                    end_idx += 1
                print(f"[DEBUG] frontmatter 结束行: {end_idx}")
                if end_idx < len(lines):
                    block = '\n'.join(lines[start_idx+1:end_idx])
                    body = '\n'.join(lines[end_idx+1:])
                    print(f"[DEBUG] frontmatter 块长度: {len(block)}")
                    print(f"[DEBUG] 解析后 body 长度: {len(body)}")

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
                            if val in PAGE_TYPES:
                                meta["type"] = val
                        elif key == "tags":
                            pass  # tags handled above
                        elif key == "created":
                            meta["created"] = val
                        elif key == "source":
                            # 清理 source 字段，移除 Markdown 链接格式
                            # 处理 [链接文本](链接地址) 格式
                            val = re.sub(r"\[.*?\]\((.*?)\)", r"\1", val)
                            meta["source"] = val
                        elif key == "linked":
                            # linked: [a, b] or linked: a, b
                            linked_str = val.strip("[]")
                            meta["linked"] = [_clean_wikilink(x) for x in linked_str.split(",") if x.strip()]
                    meta["tags"] = tags
                    print(f"[DEBUG] 解析后 meta: {meta}")
        except Exception as e:
            print(f"[DEBUG] 解析 frontmatter 时出错: {e}")
            body = md_text
    else:
        print(f"[DEBUG] 未检测到 frontmatter 开始标记")

    print(f"[DEBUG] _parse_md_frontmatter 完成")
    return meta, body


def _ensure_frontmatter(md_text, page_type, source_url):
    """
    确保 Markdown 有完整 frontmatter（SCHEMA 规定必填字段）。
    如果 LLM 没输出 frontmatter，自动补充。
    """
    print(f"[DEBUG] _ensure_frontmatter 开始，page_type={page_type}, source_url={source_url}")
    print(f"[DEBUG] 输入内容长度: {len(md_text)}")
    if md_text:
        print(f"[DEBUG] 输入内容前 200 字符: {md_text[:200]}...")
    
    meta, body = _parse_md_frontmatter(md_text)
    print(f"[DEBUG] 解析后 meta: {meta}")
    print(f"[DEBUG] 解析后 body 长度: {len(body)}")

    # 过滤营销内容
    body = _filter_marketing_content(body)
    print(f"[DEBUG] 过滤后 body 长度: {len(body)}")
    
    # 移除重复内容
    body = _remove_duplicate_content(body)
    print(f"[DEBUG] 去重后 body 长度: {len(body)}")

    # 从 body 中提取标题（第一个 # 标题）
    title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
    if not meta["title"] and title_match:
        meta["title"] = title_match.group(1).strip().strip("#").strip()
        print(f"[DEBUG] 从 body 提取标题: {meta['title']}")
    
    # 确保标题不为空
    if not meta["title"]:
        # 尝试从 body 中提取第一句话作为标题
        first_sentence = body.strip().split('。')[0].split('.')[0].split('!')[0].split('?')[0]
        if first_sentence and len(first_sentence) > 5:
            meta["title"] = first_sentence[:50]  # 限制标题长度
            print(f"[DEBUG] 从第一句话提取标题: {meta['title']}")
        else:
            meta["title"] = "Untitled"
            print(f"[DEBUG] 使用默认标题: {meta['title']}")

    # 从 body 中提取 [[链接]]
    wikilinks = re.findall(r"\[\[([^\]|]+?)\]\]", body)
    if not meta["linked"]:
        meta["linked"] = [_clean_wikilink(link) for link in wikilinks[:10]]
        print(f"[DEBUG] 从 body 提取链接: {meta['linked']}")

    # 补充缺失字段
    if not meta["created"]:
        meta["created"] = datetime.datetime.now().strftime("%Y-%m-%d")
        print(f"[DEBUG] 补充 created: {meta['created']}")
    if not meta["type"]:
        meta["type"] = page_type
        print(f"[DEBUG] 补充 type: {meta['type']}")
    if not meta["source"]:
        meta["source"] = source_url or ""
        print(f"[DEBUG] 补充 source: {meta['source']}")
    
    # 自动生成标签
    if not meta["tags"]:
        # 基于页面类型生成标签
        type_tags = {
            "concept": ["概念", "理论"],
            "paper": ["论文", "研究"],
            "person": ["人物", "学者"],
            "tool": ["工具", "技术"],
            "dataset": ["数据集", "数据"],
            "note": ["笔记", "总结"]
        }
        meta["tags"] = type_tags.get(page_type, ["笔记"])
        
        # 基于标题和内容添加更具体的标签
        content = body.lower()
        title_lower = meta["title"].lower()
        
        # 保险相关标签
        if any(keyword in content or keyword in title_lower for keyword in ["保险", "insurance"]):
            meta["tags"].append("保险")
        # 投资相关标签
        if any(keyword in content or keyword in title_lower for keyword in ["投资", "invest", "理财"]):
            meta["tags"].append("投资")
        # 高净值客户相关标签
        if any(keyword in content or keyword in title_lower for keyword in ["高客", "高净值", "wealth", "rich"]):
            meta["tags"].append("高净值客户")
        # 沟通策略相关标签
        if any(keyword in content or keyword in title_lower for keyword in ["沟通", "策略", "销售", "conversation"]):
            meta["tags"].append("沟通策略")
        
        # 去重
        meta["tags"] = list(set(meta["tags"]))
        print(f"[DEBUG] 自动生成标签: {meta['tags']}")

    # 重建 frontmatter
    fm_lines = [
        "---",
        f'title: "{meta["title"]}"',
        f"type: {meta['type']}",
        "tags:",
    ]
    for tag in (meta["tags"] or []):
        fm_lines.append(f"  - {tag}")
    fm_lines.append(f"created: {meta['created']}")
    if meta["source"]:
        # 如果 source 是 URL，使用 Markdown 链接格式
        if meta["source"].startswith("http://") or meta["source"].startswith("https://"):
            fm_lines.append(f'source: "[{meta["source"]}]({meta["source"]})"')
            print(f"[DEBUG] 使用 URL 链接格式: {meta['source']}")
        else:
            # 如果是本地文件路径，尝试创建相对链接
            fm_lines.append(f"source: {meta['source']}")
            print(f"[DEBUG] 使用本地路径格式: {meta['source']}")
    else:
        fm_lines.append("source: ")
        print(f"[DEBUG] source 为空")
    if meta["linked"]:
        linked_str = "[" + ", ".join(f'"{l}"' for l in meta["linked"]) + "]"
        fm_lines.append(f"linked: {linked_str}")
        print(f"[DEBUG] 添加 linked: {linked_str}")
    fm_lines.append("---")

    result = "\n".join(fm_lines) + "\n\n" + body
    print(f"[DEBUG] _ensure_frontmatter 完成，结果长度: {len(result)}")
    return result


def _count_wikilinks(md_text):
    """统计 Markdown 中的 [[内部链接]] 数量"""
    return len(re.findall(r"\[\[([^\]]+)\]\]", md_text))


def _fix_internal_links(text):
    """修复内容中的内部链接格式"""
    # 查找所有 [[链接]] 格式
    def replace_link(match):
        link = match.group(1)
        # 清理链接
        clean_link = _clean_wikilink(link)
        return f"[[{clean_link}]]"
    
    # 修复内部链接
    text = re.sub(r"\[\[([^\]]+)\]\]", replace_link, text)
    return text


def _write_markdown_pages(wiki_dir, md_output, source_url, default_type):
    """
    将 LLM 返回的 Markdown 写入 wiki/ 目录。
    - 支持多页面（LLM 输出包含多个 markdown 块时）
    - 自动添加 frontmatter
    - 自动命名文件（lowercase-hyphen）
    - 检查 [[链接]] 数量
    - 修复链接格式和过滤营销内容
    """
    print(f"[DEBUG] 开始处理 LLM 输出，长度={len(md_output)}")
    if md_output:
        print(f"[DEBUG] LLM 输出前 500 字符: {md_output[:500]}...")
    else:
        print("[DEBUG] LLM 输出为空")
    
    pages = _split_markdown_pages(md_output)
    print(f"[DEBUG] 拆分后得到 {len(pages)} 个页面")
    
    written = []

    for i, page_md in enumerate(pages):
        page_md = page_md.strip()
        print(f"[DEBUG] 处理第 {i+1} 个页面，长度={len(page_md)}")
        
        if not page_md or len(page_md) < 20:
            print(f"[DEBUG] 页面 {i+1} 内容过短，跳过")
            continue

        # 确保 frontmatter 完整
        try:
            page_md = _ensure_frontmatter(page_md, default_type, source_url)
            print(f"[DEBUG] 页面 {i+1} frontmatter 处理完成")
        except Exception as e:
            print(f"[ERROR] 处理 frontmatter 时出错: {e}")
            continue

        # 修复内容中的内部链接格式
        page_md = _fix_internal_links(page_md)
        print(f"[DEBUG] 页面 {i+1} 链接格式修复完成")

        # 提取标题作为文件名
        title_match = re.search(r"^#\s+(.+)$", page_md, re.MULTILINE)
        if not title_match:
            print(f"[DEBUG] 页面 {i+1} 未找到一级标题，尝试从 frontmatter 提取")
            # 尝试从 frontmatter 提取标题
            meta, _ = _parse_md_frontmatter(page_md)
            if meta.get("title"):
                title = meta["title"]
                print(f"[DEBUG] 从 frontmatter 提取标题: {title}")
            else:
                print(f"[DEBUG] 页面 {i+1} 无标题，使用默认标题")
                title = f"untitled-page-{i+1}"
        else:
            title = title_match.group(1).strip()
            print(f"[DEBUG] 从内容提取标题: {title}")

        # SCHEMA 命名规范：lowercase-hyphen
        slug = _slugify(title)
        if not slug:
            slug = f"untitled-page-{i+1}"
        print(f"[DEBUG] 生成文件名: {slug}.md")

        wiki_path = wiki_dir / f"{slug}.md"
        try:
            wiki_path.write_text(page_md, encoding="utf-8")
            written.append(str(wiki_path))
            print(f"[DEBUG] 页面 {i+1} 已写入: {wiki_path}")
        except Exception as e:
            print(f"[ERROR] 写入文件时出错: {e}")
            continue

    print(f"[DEBUG] 处理完成，共写入 {len(written)} 个页面")
    return written


def _generate_index_page(vault):
    """
    生成 wiki 索引页面，包含所有页面的列表和统计信息。
    索引页面生成在 vault 根目录下。
    """
    wiki_dir = vault / "wiki"
    entries = []
    for md_file in wiki_dir.glob("*.md"):
        if md_file.name == "index.md":
            continue
        try:
            content = md_file.read_text(encoding="utf-8", errors="ignore")
            meta, body = _parse_md_frontmatter(content)
            entries.append({
                "file": str(md_file),
                "title": meta.get("title", md_file.stem),
                "type": meta.get("type", "note"),
                "tags": meta.get("tags", []),
                "created": meta.get("created", ""),
                "source": meta.get("source", ""),
                "slug": md_file.stem,
            })
        except Exception:
            pass

    # 按创建日期排序（最新的在前）
    entries.sort(key=lambda x: x["created"] or "", reverse=True)

    # 确保每个条目都有标题
    for entry in entries:
        if not entry["title"]:
            # 如果标题为空，使用文件名作为标题
            entry["title"] = entry["slug"] or "Untitled"

    # 按类型分组
    by_type = {}
    for entry in entries:
        entry_type = entry["type"]
        if entry_type not in by_type:
            by_type[entry_type] = []
        by_type[entry_type].append(entry)

    # 按标签分组
    by_tag = {}
    for entry in entries:
        for tag in entry["tags"]:
            if tag not in by_tag:
                by_tag[tag] = []
            by_tag[tag].append(entry)

    # 生成索引页面内容
    lines = [
        "---",
        "title: 知识索引",
        "type: index",
        "tags:",
        "  - index",
        "  - overview",
        f"created: {datetime.datetime.now().strftime('%Y-%m-%d')}",
        "---",
        "",
        "# 知识索引",
        "",
        f"> 共收录 **{len(entries)}** 个知识条目",
        "",
        "## 最近更新",
        "",
    ]

    # 最近更新的 10 个条目
    recent_entries = entries[:10]
    for entry in recent_entries:
        lines.append(f"- [[wiki/{entry['slug']}|{entry['title']}]] - {entry['created']}")

    lines.extend([
        "",
        "## 按类型分类",
        "",
    ])

    # 按类型分类
    for type_name, type_entries in by_type.items():
        lines.append(f"### {type_name.title()} ({len(type_entries)})")
        for entry in type_entries:
            lines.append(f"- [[wiki/{entry['slug']}|{entry['title']}]]")
        lines.append("")

    lines.extend([
        "## 按标签分类",
        "",
    ])

    # 按标签分类（只显示有多个条目的标签）
    sorted_tags = sorted(by_tag.items(), key=lambda x: len(x[1]), reverse=True)
    for tag, tag_entries in sorted_tags:
        if len(tag_entries) > 1:
            lines.append(f"### {tag} ({len(tag_entries)})")
            for entry in tag_entries:
                lines.append(f"- [[wiki/{entry['slug']}|{entry['title']}]]")
            lines.append("")

    lines.extend([
        "## 搜索指南",
        "",
        "- 使用 `query` 功能向知识库提问",
        "- 使用 `lint` 功能检查知识库质量",
        "- 点击 [[内部链接]] 浏览相关内容",
        "",
        "## 统计信息",
        "",
        f"- 总条目数: {len(entries)}",
        f"- 总标签数: {len(by_tag)}",
        f"- 最近更新: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}",
    ])

    index_path = vault / "index.md"
    try:
        index_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"[DEBUG] 索引页面已生成: {index_path}")
        return str(index_path)
    except Exception as e:
        print(f"[ERROR] 生成索引页面时出错: {e}")
        return None


def _split_markdown_pages(md_text):
    """
    拆分 LLM 输出中的多个页面。
    识别方式：
    1. 顶级分割标记（如 ---page--- 或 #---）
    2. 多个顶级 # 标题块
    """
    # 尝试用特殊分隔符分割
    separators = [
        r"\n---\s*\n(?=# )",      # --- 后跟 # 标题
        r"\n====\s*\n(?=# )",     # === 后跟 # 标题
        r"\n\n(?=# [^#])",        # 两个换行后跟 # 标题（非子标题）
    ]

    for sep in separators:
        parts = re.split(sep, md_text)
        if len(parts) > 1:
            return parts

    # 如果没有明显分割，检查是否包含多个一级标题
    headings = list(re.finditer(r"^# [^#]", md_text, re.MULTILINE))
    if len(headings) > 1:
        parts = []
        for i, m in enumerate(headings):
            start = m.start()
            end = headings[i + 1].start() if i + 1 < len(headings) else len(md_text)
            parts.append(md_text[start:end])
        return parts

    return [md_text]


def build_knowledge_graph(wiki_dir):
    """
    建立知识图谱，形成知识网络
    返回: {
        "nodes": [...],  # 知识节点
        "edges": [...]   # 知识关联
    }
    """
    import json
    
    graph = {
        "nodes": [],
        "edges": []
    }
    
    # 使用函数内部导入，避免循环依赖
    from lint import _parse
    
    # 1. 提取所有知识节点
    for md_file in wiki_dir.glob("*.md"):
        if md_file.name == "index.md":
            continue
        try:
            content = md_file.read_text(encoding="utf-8", errors="ignore")
            parsed = _parse(content)
            
            node = {
                "id": md_file.stem,
                "title": parsed.get("title", md_file.stem),
                "type": parsed.get("type", "note"),
                "tags": parsed.get("tags", []),
                "summary": parsed.get("summary", "")[:200],
                "links": parsed.get("links", []),
                "file": str(md_file.name)
            }
            graph["nodes"].append(node)
        except Exception as e:
            print(f"[WARNING] 解析文件 {md_file} 时出错: {e}")
    
    # 2. 建立知识关联（基于链接）
    for node in graph["nodes"]:
        for link in node.get("links", []):
            clean_link = _clean_wikilink(link)
            target_slug = _slugify(clean_link)
            
            # 检查目标节点是否存在
            target_exists = any(n["id"] == target_slug for n in graph["nodes"])
            
            graph["edges"].append({
                "source": node["id"],
                "target": target_slug,
                "type": "references",
                "target_exists": target_exists
            })
    
    # 3. 建立知识关联（基于标签）
    tag_groups = {}
    for node in graph["nodes"]:
        for tag in node.get("tags", []):
            if tag not in tag_groups:
                tag_groups[tag] = []
            tag_groups[tag].append(node["id"])
    
    for tag, node_ids in tag_groups.items():
        if len(node_ids) > 1:
            for i, node1 in enumerate(node_ids):
                for node2 in node_ids[i+1:]:
                    # 检查是否已存在关联
                    edge_exists = any(
                        (e["source"] == node1 and e["target"] == node2) or
                        (e["source"] == node2 and e["target"] == node1)
                        for e in graph["edges"]
                    )
                    if not edge_exists:
                        graph["edges"].append({
                            "source": node1,
                            "target": node2,
                            "type": "same_tag",
                            "tag": tag
                        })
    
    print(f"[GRAPH] 知识图谱生成完成: {len(graph['nodes'])} 个节点, {len(graph['edges'])} 条边")
    return graph


def run_ingest(vault_path, content, source_url, content_type, title,
               llm_client, cfg=None):
    """
    SCHEMA v1.1 工作流：
    raw/ → 分析 → 编译（SCHEMA → 指令 → 内容）→ wiki/
    """
    vault = Path(vault_path)

    # 确保目录存在（SCHEMA 规定：raw/ 只读，wiki/ 输出，schema/ 规则）
    raw_dir = vault / "raw"
    wiki_dir = vault / "wiki"
    schema_dir = vault / "schema"
    outputs_dir = vault / "outputs"
    for d in [raw_dir, wiki_dir, schema_dir, outputs_dir]:
        d.mkdir(parents=True, exist_ok=True)

    # 1. 保存原始内容到 raw/（只读）
    date_str = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    safe = re.sub(r"[\\/:*?\"<>|]", "_", (title or "untitled")[:60])
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

    # 2. 判断 page_type（根据 content_type 推断）
    page_type = "note"
    if cfg:
        page_type = cfg.guess_page_type(content_type)

    # 3. 读取 SCHEMA.md 内容（第一步）
    schema_text = ""
    if cfg:
        schema_text = cfg.get_schema_text()

    # 4. 查找相关条目（用于增量合并）
    related = find_related(wiki_dir, title)
    existing_info = ""
    if related:
        existing_info = "## 知识库已有条目（请合并或追加到更新日志）：\n"
        for entry in related[:3]:
            existing_info += f"\n### [[{entry['title']}]]\n{entry['summary'][:500]}\n"

    # 5. LLM 编译（SCHEMA 模式：直接返回 Markdown）
    user_instructions = (
        f"- 本次推荐 page_type：{page_type}（来自 content_type={content_type}）\n"
        "- 如果原始资料包含多个主题，拆分为多个 wiki 页面\n"
    )

    md_output = llm_client.ingest(
        raw_text=content,
        content_type=content_type,
        title=title,
        source_url=source_url,
        page_type=page_type,
        schema_text=schema_text,
        existing_knowledge=existing_info,
        user_instructions=user_instructions,
    )

    # 检查 LLM 输出
    print(f"[DEBUG] LLM 返回内容长度: {len(md_output)}")
    if md_output:
        print(f"[DEBUG] LLM 返回前 200 字符: {md_output[:200]}...")
        # 检查是否包含有效的 Markdown
        has_heading = re.search(r"^#\s+", md_output, re.MULTILINE)
        has_frontmatter = md_output.strip().startswith("---")
        print(f"[DEBUG] LLM 输出包含一级标题: {has_heading is not None}")
        print(f"[DEBUG] LLM 输出包含 frontmatter: {has_frontmatter}")
    else:
        print("[ERROR] LLM 返回空内容")

    # 6. 解析 LLM 返回的 Markdown，写入 wiki/
    wiki_paths = _write_markdown_pages(wiki_dir, md_output, source_url, page_type)

    # 7. 生成索引页面
    index_path = _generate_index_page(vault)
    
    # 8. 质量检查（新增）
    quality_issues = []
    try:
        # 使用函数内部导入，避免循环依赖
        from lint import _auto_check, _parse
        
        # 收集所有 wiki 条目
        entries = []
        for md_file in wiki_dir.glob("*.md"):
            if md_file.name == "index.md":
                continue
            try:
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
                    })
            except Exception as e:
                print(f"[WARNING] 解析文件 {md_file} 时出错: {e}")
        
        # 执行质量检查
        if entries:
            quality_issues = _auto_check(entries)
            print(f"[LINT] 发现 {len(quality_issues)} 个质量问题")
            for issue in quality_issues[:5]:  # 只显示前 5 个问题
                print(f"[LINT] {issue['type']}: {issue['message']}")
    except Exception as e:
        print(f"[ERROR] 质量检查时出错: {e}")
    
    # 9. 生成知识图谱（新增）
    knowledge_graph_path = None
    try:
        import json
        
        graph = build_knowledge_graph(wiki_dir)
        knowledge_graph_path = wiki_dir / "knowledge_graph.json"
        knowledge_graph_path.write_text(
            json.dumps(graph, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"[GRAPH] 知识图谱已保存: {knowledge_graph_path}")
    except Exception as e:
        print(f"[ERROR] 生成知识图谱时出错: {e}")
    
    # 统计真正的 wiki 页面数量（不包括索引页面）
    wiki_only_paths = [path for path in wiki_paths if "index.md" not in path]
    
    # 将索引页面添加到返回结果中
    all_paths = wiki_only_paths.copy()
    if index_path:
        all_paths.append(index_path)
    
    print(f"[DEBUG] 最终写入 wiki 页面数量: {len(wiki_only_paths)}")
    if wiki_only_paths:
        for path in wiki_only_paths:
            print(f"[DEBUG] 写入页面: {path}")
    else:
        print("[WARNING] 未写入任何 wiki 页面")

    return {
        "raw": str(raw_path),
        "wiki": wiki_only_paths,  # 只包含真正的 wiki 页面
        "all": all_paths,         # 包含所有页面，包括索引页面
        "quality_issues": quality_issues,  # 质量问题列表
        "knowledge_graph": str(knowledge_graph_path) if knowledge_graph_path else None,  # 知识图谱路径
    }