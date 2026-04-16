"""测试术语翻译功能"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from ingest.pipeline import _translate_terms, _ensure_frontmatter

# 测试术语翻译
print("[INFO] 测试术语翻译功能...")

# 测试文本
test_text = """---
title: indexed-universal-life-insurance
type: concept
tags:
  - insurance
  - investment
created: 2024-05-21
source: "raw/test.md"
linked: ["wealth-management", "risk-management", "sp500-index", "tax-planning"]
---

# indexed-universal-life-insurance

This is about wealth management and risk management using IUL (Indexed Universal Life Insurance).

## Key Concepts

- [[wealth-management]]
- [[risk-management]]
- [[sp500-index]]
- [[tax-planning]]
"""

# 测试翻译功能
print("[TEST 1] 测试术语翻译...")
translated = _translate_terms(test_text)
print("[RESULT] 翻译结果:")
print(translated)

# 测试 frontmatter 处理
print("\n[TEST 2] 测试 frontmatter 处理...")
result = _ensure_frontmatter(test_text, "concept", "test.md")
print("[RESULT] 处理结果:")
print(result)

print("\n[INFO] 测试完成！")
