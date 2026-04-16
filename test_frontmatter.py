#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 frontmatter 格式修复
"""

import sys
sys.path.insert(0, 'e:\\AI\\Karpathy')

from ingest.pipeline import _ensure_frontmatter

# 测试用例
test_cases = [
    {
        "name": "无 frontmatter 的内容",
        "content": "# 测试标题\n这是测试内容",
        "type": "note",
        "source": "https://example.com"
    },
    {
        "name": "有 frontmatter 但格式不正确的内容",
        "content": "---title: 测试\ntype: note---\n# 测试标题\n这是测试内容",
        "type": "note",
        "source": "https://example.com"
    },
    {
        "name": "有完整 frontmatter 的内容",
        "content": "---\ntitle: 测试标题\ntype: note\ntags:\n  - test\ncreated: 2026-04-12\nsource: https://example.com\n---\n# 测试标题\n这是测试内容",
        "type": "note",
        "source": "https://example.com"
    }
]

print("测试 frontmatter 格式修复")
print("=" * 60)

for i, test_case in enumerate(test_cases):
    print(f"\n测试 {i+1}: {test_case['name']}")
    print("-" * 40)
    
    try:
        result = _ensure_frontmatter(
            test_case['content'],
            test_case['type'],
            test_case['source']
        )
        print("处理成功")
        print("生成的 frontmatter:")
        # 提取 frontmatter 部分
        lines = result.split('\n')
        frontmatter_lines = []
        in_frontmatter = False
        for line in lines:
            if line == '---':
                if in_frontmatter:
                    break
                in_frontmatter = True
                frontmatter_lines.append(line)
            elif in_frontmatter:
                frontmatter_lines.append(line)
        
        for line in frontmatter_lines:
            print(f"  {line}")
        
        # 检查格式是否正确
        if len(frontmatter_lines) >= 2 and frontmatter_lines[0] == '---':
            print("frontmatter 格式正确")
        else:
            print("frontmatter 格式不正确")
            
        # 显示完整的结果（前 200 字符）
        print("生成的完整内容（前 200 字符）:")
        print(result[:200] + "...")
            
    except Exception as e:
        print(f"处理失败: {e}")

print("\n" + "=" * 60)
print("测试完成")