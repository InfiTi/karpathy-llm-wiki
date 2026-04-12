"""测试知识图谱关联查询功能"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pathlib import Path
from query import find_related_topics, _load_knowledge_graph, _expand_with_graph, _search_wiki, _build_context

# 设置路径
wiki_dir = Path("F:/Obsidian/wiki Test/wiki")

# 测试加载知识图谱
print("[INFO] 测试加载知识图谱...")
graph = _load_knowledge_graph(wiki_dir)
if graph:
    print(f"[RESULT] 知识图谱节点数: {len(graph.get('nodes', []))}")
    print(f"[RESULT] 知识图谱边数: {len(graph.get('edges', []))}")
else:
    print("[WARNING] 知识图谱未找到")

# 测试搜索 wiki
print("\n[INFO] 测试搜索 wiki...")
results = _search_wiki(wiki_dir, "保险销售策略")
print(f"[RESULT] 搜索结果数: {len(results)}")
for r in results[:3]:
    print(f"  - {r['title']} (score: {r['score']})")

# 测试基于知识图谱扩展
if graph:
    print("\n[INFO] 测试知识图谱扩展...")
    expanded = _expand_with_graph(results, graph, "保险销售策略")
    print(f"[RESULT] 扩展后结果数: {len(expanded)}")
    for r in expanded:
        from_graph = r.get('from_graph', False)
        print(f"  - {r['title']} {'[图谱扩展]' if from_graph else ''}")

# 测试查找相关主题
print("\n[INFO] 测试查找相关主题...")
related = find_related_topics(wiki_dir, "专业投资者保险销售策略", max_hops=2)
print(f"[RESULT] 相关主题数: {len(related)}")
for r in related:
    print(f"  - {r['title']} (hop: {r['hop']}, path: {' -> '.join(r['path'])})")

# 测试智能上下文构建
print("\n[INFO] 测试智能上下文构建...")
if graph:
    expanded = _expand_with_graph(results, graph, "保险销售策略")
else:
    expanded = results
context = _build_context(expanded, max_tokens=2000)
print(f"[RESULT] 上下文长度: {len(context)} 字符")
print(f"[RESULT] 上下文预览:\n{context[:500]}...")
