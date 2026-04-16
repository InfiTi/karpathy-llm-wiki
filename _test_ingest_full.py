"""测试完整的 ingest 流程"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from ingest.pipeline import _write_markdown_pages
from pathlib import Path

# 创建临时测试目录
test_dir = Path("test_wiki")
test_dir.mkdir(exist_ok=True)

# 测试内容（模拟 LLM 输出）
test_content = """---
title: indexed-universal-life-insurance
type: concept
tags:
  - insurance
  - investment
  - financial planning
created: 2026-04-15
source: "test_source.md"
linked: ["wealth-management", "risk-management", "sp500-index", "tax-planning"]
---

# indexed-universal-life-insurance

## 摘要

指数型万能寿险（IUL）是一种结合了保险保障和投资功能的保险产品，具有灵活的保费支付和现金价值积累功能。

## 核心观点

1. **双重功能**：同时提供保险保障和投资增长机会
2. **灵活性**：保费支付和死亡保险金可根据需求调整
3. **指数挂钩**：现金价值增长与特定指数（如标普500）表现挂钩
4. **保底收益**：即使指数下跌，现金价值也有保底收益
5. **税务优势**：现金价值增长和死亡保险金通常具有税务优势

## 运作机制

- **现金价值**：保费扣除费用后进入现金价值账户
- **指数参与**：现金价值与指数表现挂钩，通常有参与率限制
- **费用结构**：包括保险成本、管理费用等
- **保单贷款**：可从现金价值中借款，无需税务后果

## 适用人群

- **高净值人士**：寻求税务高效的财富传承
- **企业主**：作为企业福利和 succession planning 工具
- **年轻专业人士**：希望在保障的同时积累现金价值

## 风险与注意事项

- **费用较高**： compared to term life insurance
- **复杂程度**：产品结构复杂，需专业建议
- **收益限制**：指数参与率和上限可能限制潜在收益
- **保单维持**：需确保保费支付足够维持保单有效

## 核心概念关联

- [[wealth-management]]
- [[risk-management]]
- [[sp500-index]]
- [[tax-planning]]
- [[financial-planning]]
"""

print("[INFO] 测试完整的 ingest 流程...")

# 运行测试
result = _write_markdown_pages(test_dir, test_content, "test_source.md", "concept")

print(f"[RESULT] 写入文件: {result}")

# 检查生成的文件
if result:
    output_file = Path(result[0])
    if output_file.exists():
        print("\n[INFO] 生成的文件内容:")
        print(output_file.read_text(encoding="utf-8"))
    else:
        print("[ERROR] 文件未生成")
else:
    print("[ERROR] 未写入任何文件")

# 清理测试目录
for file in test_dir.glob("*.md"):
    file.unlink()
test_dir.rmdir()

print("\n[INFO] 测试完成！")
