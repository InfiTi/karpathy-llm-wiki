"""测试完整的查询功能"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from query import run_query

# 测试查询
print("[INFO] 测试完整查询功能...")

# 模拟 LLM 客户端
class MockLLMClient:
    def query(self, question, context, prompts=None):
        return {
            "answer": f"这是关于'{question}'的回答，基于以下上下文：\n{context[:100]}...",
            "sources": ["黄金投资", "黄金投资概念"],
            "confidence": "high"
        }

# 运行查询
vault_path = "F:/Obsidian/wiki Test"
llm_client = MockLLMClient()

result = run_query("什么是黄金投资？", vault_path, llm_client)

print("[RESULT] 查询结果:")
print(f"  回答: {result['answer']}")
print(f"  来源: {result['sources']}")
print(f"  置信度: {result['confidence']}")

print("\n[INFO] 测试完成！")
