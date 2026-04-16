"""测试重新生成 wiki 文件"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pathlib import Path

# 读取原始资料
raw_file = Path("F:/Obsidian/wiki Test/raw/2026-04-13_025413_没有愿力，心力和定力的人，终究学不成专业！#寿险顾问的学习之道#.md")
raw_content = raw_file.read_text(encoding="utf-8")

# 提取正文（跳过 frontmatter）
lines = raw_content.split('\n')
body_start = 0
for i, line in enumerate(lines):
    if line.strip() == '---' and i > 0:
        body_start = i + 1
        break

content = '\n'.join(lines[body_start:])
title = "没有愿力，心力和定力的人，终究学不成专业！#寿险顾问的学习之道#"
source_url = "https://mp.weixin.qq.com/s/w3vtFFECcokVOg_NZU422A"

print(f"[INFO] 原始内容长度: {len(content)}")
print(f"[INFO] 标题: {title}")

# 加载配置
import config
cfg = config.Config()
print(f"[INFO] vault_path: {cfg.get('vault_path')}")
print(f"[INFO] model: {cfg.get('model')}")

# 创建 LLM 客户端
from llm import LLMClient
llm = LLMClient(cfg.get("llm_url"), cfg.get("model"), warmup=False)
print("[INFO] LLM 客户端创建完成")

# 运行 ingest
from ingest.pipeline import run_ingest
vault = Path(cfg.get("vault_path"))

print("[INFO] 开始运行 ingest...")
result = run_ingest(
    vault, content, source_url, "web",
    title, llm, cfg=cfg
)

print(f"\n[RESULT] raw: {result['raw']}")
print(f"[RESULT] wiki: {result['wiki']}")
print(f"[RESULT] quality_issues: {len(result.get('quality_issues', []))}")
print(f"[RESULT] knowledge_graph: {result.get('knowledge_graph')}")
