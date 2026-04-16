"""测试查询功能"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pathlib import Path
from query import _extract_keywords, _search_wiki

# 设置路径
wiki_dir = Path("F:/Obsidian/wiki Test/wiki")

# 测试关键词提取
print("[INFO] 测试关键词提取...")
question = "什么是黄金投资？"
keywords = _extract_keywords(question)
print(f"[RESULT] 关键词: {keywords}")

# 测试搜索
print("\n[INFO] 测试搜索...")
results = _search_wiki(wiki_dir, question)
print(f"[RESULT] 搜索结果数: {len(results)}")
for r in results:
    print(f"  - {r['title']} (score: {r['score']})")

# 检查文件内容
print("\n[INFO] 检查文件内容...")
for md_file in wiki_dir.glob("*.md"):
    if "黄金" in md_file.stem:
        print(f"\n文件: {md_file.stem}")
        content = md_file.read_text(encoding="utf-8", errors="ignore")
        print(f"标题: {md_file.stem}")
        print(f"内容包含'黄金': {'黄金' in content}")
        print(f"内容包含'投资': {'投资' in content}")
