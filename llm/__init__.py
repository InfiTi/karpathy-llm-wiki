"""llm: LLM 调用封装，SCHEMA 模式：直接输出 Markdown"""
import requests, json, re, time, sys, datetime


class LLMClient:
    def __init__(self, base_url, model, api_key="ollama", timeout=600, warmup=True, enable_thinking=False):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self.enable_thinking = enable_thinking
        if warmup:
            t0 = time.time()
            print(f"[LLM] 预热中（首次加载模型到GPU，约30-60s）...")
            try:
                self.chat([{"role": "user", "content": "hi"}], temperature=0.1)
                print(f"[LLM] 预热完成，耗时={time.time()-t0:.1f}s")
            except Exception as e:
                print(f"[LLM] 预热失败（模型可能已加载）: {e}")

    def _is_qwen3(self):
        return "qwen3" in self.model.lower()

    def _post(self, payload, stream=True):
        headers = {"Content-Type": "application/json"}
        if self.api_key and self.api_key != "ollama":
            headers["Authorization"] = f"Bearer {self.api_key}"
        url = f"{self.base_url}/chat/completions"
        t0 = time.time()
        print(f"[HTTP] POST {url}")
        print(f"[HTTP] model={payload.get('model')}, messages={len(payload.get('messages',[]))}, stream={stream}")

        if stream:
            payload["stream"] = True
            resp = requests.post(url, headers=headers, json=payload, stream=True, timeout=self.timeout)
            print(f"[HTTP] 流式响应开始: status={resp.status_code}")

            full_content = ""
            thinking_content = ""
            chunk_count = 0
            in_thinking = False
            try:
                for line in resp.iter_lines():
                    if line:
                        line = line.decode("utf-8")
                        if line.startswith("data: "):
                            data = line[6:]
                            if data.strip() == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                delta = chunk.get("choices", [{}])[0].get("delta", {})

                                # 兼容不同模型的响应格式
                                reasoning = delta.get("reasoning_content", "") or delta.get("thinking", "") or delta.get("reasoning", "")
                                content = delta.get("content", "")

                                if reasoning:
                                    thinking_content += reasoning
                                    if not in_thinking:
                                        in_thinking = True
                                        print(f"[LLM] 模型正在思考中...（思考内容不会出现在最终输出）")
                                    chunk_count += 1
                                    if chunk_count % 100 == 0:
                                        print(f"[LLM] 思考进度: 已生成 {len(thinking_content)} 字符思考内容")

                                if content:
                                    if in_thinking:
                                        in_thinking = False
                                        print(f"[LLM] 思考完成（{len(thinking_content)} 字符），开始输出正文...")
                                    full_content += content
                                    chunk_count += 1
                                    if chunk_count % 50 == 0:
                                        print(f"[LLM] 输出进度: 已生成 {len(full_content)} 字符")
                            except json.JSONDecodeError:
                                pass
            except requests.exceptions.Timeout:
                print(f"[HTTP] 流式超时! elapsed={time.time()-t0:.1f}s")
                if full_content:
                    print(f"[LLM] 超时但已有部分输出({len(full_content)}字符)，尝试使用")
                else:
                    raise
            except Exception as e:
                print(f"[HTTP] 流式处理出错: {e}")
                if full_content:
                    print(f"[LLM] 出错但已有部分输出({len(full_content)}字符)，尝试使用")
                else:
                    raise

            elapsed = time.time() - t0
            print(f"[HTTP] 流式完成: elapsed={elapsed:.1f}s, 正文={len(full_content)}字符, 思考={len(thinking_content)}字符")
            return {"choices": [{"message": {"content": full_content}}]}
        else:
            resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
            elapsed = time.time() - t0
            print(f"[HTTP] 响应: status={resp.status_code}, elapsed={elapsed:.1f}s, body长度={len(resp.content)}")
            return json.loads(resp.content.decode("utf-8"))

    def chat(self, messages, temperature=0.3, stream=True):
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 8192,
        }

        if self._is_qwen3() and not self.enable_thinking:
            modified_messages = []
            for m in messages:
                if m["role"] == "user":
                    modified_messages.append({
                        "role": "user",
                        "content": m["content"] + "\n/no_think"
                    })
                else:
                    modified_messages.append(m)
            payload["messages"] = modified_messages
            print(f"[LLM] Qwen3 检测: 已添加 /no_think 禁用思考模式")

        result = self._post(payload, stream=stream)
        return result["choices"][0]["message"]["content"]

    # ------------------------------------------------------------------ #
    # Ingest（SCHEMA 模式）：直接返回 Markdown 字符串
    # ------------------------------------------------------------------ #
    def ingest(self, raw_text, content_type, title, source_url,
               page_type, schema_text, existing_knowledge="",
               user_instructions="", prompts=None):
        """
        按 SCHEMA 规范编译原始资料，返回 Markdown 字符串。

        参数:
          raw_text        - 原始内容（截断到 8000 字）
          content_type    - web/video/pdf/docx
          title           - 原始标题
          source_url      - 来源 URL
          page_type       - SCHEMA 规定的页面类型（concept/paper/person/tool/dataset/note）
          schema_text     - 完整 SCHEMA.md 内容（第一步）
          existing_knowledge - 已有 wiki 条目摘要（用于增量合并）
          user_instructions   - 执行指令（第二步）
          prompts         - 可选，prompts["system"] 和 prompts["user"] 会替换
        """
        # 构建三步合一的消息
        schema_block = schema_text or ""

        system_prompt = (
            "你是一个严格的 LLM Wiki 编译系统。\n"
            "严格遵守以下 SCHEMA 规范输出，不输出任何解释，只输出 Markdown 维基页面。"
        )

        user_prompt = (
            f"{schema_block}\n\n"
            "## 提示词 / 执行指令\n"
            "你是 LLM Wiki 自动编译系统，基于 Karpathy LLM Wiki 理念工作。\n"
            "请严格遵守上方 SCHEMA 所有规则，对下方原始资料进行深度知识提炼：\n\n"
            
            "### 核心要求：\n\n"
            "1. **知识提炼**（最重要）：\n"
            "   - 提炼出 3-5 个核心观点，每个观点用一句话概括\n"
            "   - 总结出可操作的方法论，形成清晰的步骤\n"
            "   - 提取具体的实战策略和话术，保留原文示例\n"
            "   - 保留完整的案例分析过程，包括问题、分析、解决方案\n\n"
            
            "2. **内容完整性**：\n"
            "   - 必须保留原文的所有核心章节\n"
            "   - 必须保留重要的实战内容（提问示例、话术、案例）\n"
            "   - 必须保留完整的逻辑链条（问题 → 分析 → 解决方案）\n"
            "   - 如果原文内容过长，优先保留核心观点和实战内容\n\n"
            
            "3. **知识结构化**：\n"
            "   - 建立清晰的层次结构（一级标题、二级标题、三级标题）\n"
            "   - 提炼出核心概念并建立 [[内部链接]]，每页至少 10 个\n"
            "   - 形成知识网络，标注知识之间的关联关系\n"
            "   - 为每个核心概念创建独立的 wiki 页面\n\n"
            
            "4. **质量标准**：\n"
            "   - 禁止幻觉，所有内容必须来自原始资料\n"
            "   - 矛盾信息标注 ⚠️\n"
            "   - 过滤营销内容（直播预约、个人宣传、扫码关注等）\n"
            "   - 确保内容客观、专业、可操作\n\n"
            
            "5. **输出格式**：\n"
            "   - 只输出最终的 Markdown 维基页面，不解释、不闲聊\n"
            "   - 每页独立成文件，文件名小写+短横线\n"
            "   - 强制添加 YAML frontmatter\n"
            "   - 判断原始资料类型，选择最合适的 page type：\n"
            "     paper（论文）/ concept（概念）/ tool（工具）/ person（人物）/ dataset（数据集）/ note（笔记）\n"
            "   - 如果原始资料包含多个独立主题，请拆分为多个 wiki 页面\n\n"
            
            f"- 本次推荐 page_type：{page_type}\n\n"
            f"## 原始资料\n\n"
            f"来源：{source_url or '本地文件'}\n"
            f"原始标题：{title or '无标题'}\n"
            f"推荐 page_type：{page_type}\n\n"
            "---\n"
            f"{raw_text[:12000]}\n"
            "---\n\n"
            f"{existing_knowledge}"
            "请输出 Markdown 维基页面："
        )

        t0 = time.time()
        print(f"[LLM] ingest() 开始，模型={self.model}，超时={self.timeout}s，raw_text长度={len(raw_text)}")
        print(f"[LLM] 用户提示词长度: {len(user_prompt)}")
        
        try:
            result = self.chat([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ], temperature=0.1)
            print(f"[LLM] ingest() 完成，耗时={time.time()-t0:.1f}s，返回长度={len(result)}")
            
            # 检查返回内容是否为空
            if not result or len(result.strip()) == 0:
                print("[ERROR] LLM 返回空内容，尝试使用非流式模式")
                # 尝试使用非流式模式
                result = self.chat([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ], temperature=0.1, stream=False)
                print(f"[LLM] 非流式模式返回长度={len(result)}")
            
            return result
        except Exception as e:
            print(f"[ERROR] ingest() 出错: {e}")
            # 尝试使用非流式模式
            try:
                print("[LLM] 尝试使用非流式模式")
                result = self.chat([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ], temperature=0.1, stream=False)
                print(f"[LLM] 非流式模式返回长度={len(result)}")
                return result
            except Exception as e2:
                print(f"[ERROR] 非流式模式也失败: {e2}")
                # 返回一个默认的 Markdown 页面
                default_md = f"""
---
title: "{title or '无标题'}"
type: {page_type}
tags:
  - 笔记
  - 自动生成
created: {datetime.datetime.now().strftime('%Y-%m-%d')}
source: "{source_url or '本地文件'}"
---

# {title or '无标题'}

## 内容摘要

原始资料来自：{source_url or '本地文件'}

由于 LLM 调用失败，无法生成详细内容。

## 原始内容

```
{raw_text[:1000]}...
```
"""
                return default_md

    # ------------------------------------------------------------------ #
    # Query
    # ------------------------------------------------------------------ #
    def query(self, question, context, prompts=None):
        system_prompt = prompts.get("system") if prompts else self._default_query_system()
        user_prompt = prompts.get("user", "").format(question=question, context=context)
        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.3)
        return self._parse_json(raw)

    def _default_query_system(self):
        return (
            "你是一个知识助手，同时是知识库管理员（LLM Wiki）。\n"
            "两步工作：1. 回答问题 2. 知识补充建议。\n"
            "输出严格 JSON。"
        )

    def _parse_json(self, raw):
        cleaned = re.sub(r"^```json\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            return json.loads(cleaned)
        except Exception:
            m = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except Exception:
                    pass
        # 如果无法解析为 JSON，返回默认结构
        return {
            "answer": raw,
            "quality_score": 5,
            "suggest_save": False,
            "derived_from": []
        }

    # ------------------------------------------------------------------ #
    # Lint
    # ------------------------------------------------------------------ #
    def lint(self, all_summaries, all_links, entries, prompts=None):
        system_prompt = prompts.get("system") if prompts else self._default_lint_system()
        entry_text = "\n\n".join(
            f"### {e['title']}\n标签: {','.join(e.get('tags', []))}\n摘要: {e.get('summary', '')[:200]}"
            for e in entries
        )
        user_prompt = (
            f"## 知识库摘要\n---\n{all_summaries}\n---\n\n"
            f"## 所有链接概念（共 {len(all_links)} 个）\n{', '.join(sorted(all_links))}\n\n"
            f"## 详细条目\n---\n{entry_text}\n---\n\n请严格输出 JSON。"
        )
        raw = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.2)
        return self._parse_json(raw)

    def _default_lint_system(self):
        return (
            "你是知识库审计员。严格对照 SCHEMA v1.1 检查 wiki/ 质量。\n"
            "输出严格 JSON：{score,overall_assessment,issues,improvements}。"
        )
