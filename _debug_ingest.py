"""KWiki ingest 调试脚本 - 逐行打印日志，找卡点"""
import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))

print("[DEBUG] === 启动 ===")
t_global = time.time()

# 1. import
print("[DEBUG 1/8] import config...")
import config
cfg = config.Config()
print(f"[DEBUG]   vault_path={cfg.get('vault_path')}")
print(f"[DEBUG]   llm_url={cfg.get('llm_url')}")
print(f"[DEBUG]   model={cfg.get('model')}")

# 2. fetchers
print("\n[DEBUG 2/8] import fetchers...")
import fetchers

# 3. detect type
TEST_URL = "https://example.com"
ctype = None
print(f"\n[DEBUG 3/8] detect_type({TEST_URL})...")
t0 = time.time()
try:
    ctype = fetchers.detect_type(TEST_URL)
    print(f"[DEBUG]   type={ctype} ({time.time()-t0:.1f}s)")
except Exception as e:
    print(f"[DEBUG]   ERROR: {e}")
    import traceback; traceback.print_exc()

# 4. fetch content
print(f"\n[DEBUG 4/8] fetch_content({TEST_URL}, {ctype})...")
t0 = time.time()
try:
    data = fetchers.fetch_content(TEST_URL, ctype)
    print(f"[DEBUG]   title={data.get('title','?')[:50]}")
    print(f"[DEBUG]   text长度={len(data.get('text',''))} ({time.time()-t0:.1f}s)")
except Exception as e:
    print(f"[DEBUG]   ERROR: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# 5. llm client
print("\n[DEBUG 5/8] 创建 LLMClient...")
t0 = time.time()
try:
    from llm import LLMClient
    llm = LLMClient(cfg.get("llm_url"), cfg.get("model"), warmup=False)
    print(f"[DEBUG]   LLMClient 创建完成 ({time.time()-t0:.1f}s)")
except Exception as e:
    print(f"[DEBUG]   ERROR: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# 6. run_ingest - 分段
print("\n[DEBUG 6/8] run_ingest 准备...")
try:
    from ingest.pipeline import run_ingest
    from pathlib import Path
    vault = Path(cfg.get("vault_path"))
    print(f"[DEBUG]   vault={vault}")
    print(f"[DEBUG]   vault存在? {vault.exists()}")
except Exception as e:
    print(f"[DEBUG]   ERROR: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# 7. 关键测试：直接调 llm_client.ingest()（不看 run_ingest）
print("\n[DEBUG 7/8] 直接调 llm_client.ingest()（小文本测试）...")
t0 = time.time()
try:
    test_md = llm.ingest(
        raw_text="这是一个测试内容。机器学习是人工智能的一个分支。",
        content_type="web",
        title="测试",
        source_url="https://example.com",
        page_type="concept",
        schema_text="",
        existing_knowledge="",
        user_instructions="请将上文转化为 Markdown wiki 格式，只输出 Markdown，不要其他内容。",
    )
    print(f"[DEBUG]   ingest OK，长度={len(test_md)} ({time.time()-t0:.1f}s)")
    print(f"[DEBUG]   前200字: {test_md[:200]}")
except Exception as e:
    print(f"[DEBUG]   ingest ERROR: {e}")
    import traceback; traceback.print_exc()

# 8. 完整 run_ingest
print(f"\n[DEBUG 8/8] 完整 run_ingest（真实内容，长文本）...")
t0 = time.time()
try:
    result = run_ingest(
        vault, data["text"], TEST_URL, ctype,
        data.get("title", "test"), llm, cfg=cfg
    )
    print(f"[DEBUG]   run_ingest OK ({time.time()-t0:.1f}s)")
    print(f"[DEBUG]   raw: {result['raw']}")
    print(f"[DEBUG]   wiki: {result['wiki']}")
except Exception as e:
    print(f"[DEBUG]   run_ingest ERROR: {e}")
    import traceback; traceback.print_exc()

print(f"\n[DEBUG] === 全部完成，耗时={time.time()-t_global:.1f}s ===")
