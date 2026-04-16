#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试索引页面生成功能
"""

import os
import sys
sys.path.insert(0, 'e:\\AI\\Karpathy')

from ingest.pipeline import _generate_index_page
from pathlib import Path

# 测试目录
TEST_WIKI_DIR = Path("F:\\Obsidian\\wiki Test\\wiki")

print("测试索引页面生成功能")
print("=" * 60)

# 检查测试目录是否存在
if not TEST_WIKI_DIR.exists():
    print(f"错误: 测试目录不存在: {TEST_WIKI_DIR}")
    sys.exit(1)

print(f"测试目录: {TEST_WIKI_DIR}")

# 生成索引页面
try:
    index_path = _generate_index_page(TEST_WIKI_DIR)
    if index_path:
        print(f"成功: 索引页面生成在: {index_path}")
        
        # 检查索引页面是否存在
        index_file = Path(index_path)
        if index_file.exists():
            print("成功: 索引页面文件存在")
            
            # 读取并显示索引页面内容（前 500 字符）
            content = index_file.read_text(encoding="utf-8", errors="ignore")
            print("索引页面内容（前 500 字符）:")
            print(content[:500] + "...")
            
            # 检查内容是否包含必要的部分
            if "知识索引" in content:
                print("成功: 索引页面包含标题")
            else:
                print("错误: 索引页面不包含标题")
                
            if "按类型分类" in content:
                print("成功: 索引页面包含按类型分类部分")
            else:
                print("错误: 索引页面不包含按类型分类部分")
                
            if "按标签分类" in content:
                print("成功: 索引页面包含按标签分类部分")
            else:
                print("错误: 索引页面不包含按标签分类部分")
                
        else:
            print("错误: 索引页面文件不存在")
    else:
        print("错误: 索引页面生成失败")
        
except Exception as e:
    print(f"错误: 生成索引页面时出错: {e}")

print("\n" + "=" * 60)
print("测试完成")