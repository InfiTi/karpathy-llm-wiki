"""测试生成知识图谱可视化"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pathlib import Path
from outputs import generate_knowledge_graph_html, generate_stats_report, generate_tag_cloud_html

# 设置路径
wiki_dir = Path("F:/Obsidian/wiki Test/wiki")
output_dir = Path("F:/Obsidian/wiki Test/outputs")

# 生成知识图谱可视化
print("[INFO] 生成知识图谱可视化...")
graph_path = generate_knowledge_graph_html(
    wiki_dir / "knowledge_graph.json",
    output_dir / "knowledge_graph.html"
)
print(f"[RESULT] 知识图谱可视化: {graph_path}")

# 生成统计报告
print("\n[INFO] 生成统计报告...")
stats_path = generate_stats_report(wiki_dir, output_dir / "stats_report.md")
print(f"[RESULT] 统计报告: {stats_path}")

# 生成标签云
print("\n[INFO] 生成标签云...")
tag_cloud_path = generate_tag_cloud_html(wiki_dir, output_dir / "tag_cloud.html")
print(f"[RESULT] 标签云: {tag_cloud_path}")
