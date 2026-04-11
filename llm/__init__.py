"""llm: LLM 调用封装，支持 Ollama / OpenAI 兼容接口"""
import requests, json

class LLMClient:
    def __init__(self, base_url, model, api_key="ollama", timeout=180):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout

    def _post(self, payload):
        headers = {"Content-Type": "application/json"}
        if self.api_key and self.api_key != "ollama":
            headers["Authorization"] = f"Bearer {self.api_key}"
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=headers, json=payload, timeout=self.timeout
        )
        # 关键修复：从原始字节流直接 UTF-8 解码
        # requests 库默认用 latin1 解码 JSON 响应，导致中文乱码
        return json.loads(resp.content.decode("utf-8"))

    def chat(self, messages, temperature=0.3):
        payload = {"model": self.model, "messages": messages, "temperature": temperature}
        result = self._post(payload)
        return result["choices"][0]["message"]["content"]

    def refine_content(self, text, content_type, title=""):
        type_prompts = {
            "web": "这篇网页文章",
            "video": "这个视频",
            "pdf": "这份PDF文档",
            "docx": "这份Word文档",
        }
        type_desc = type_prompts.get(content_type, "这个内容")
        system_prompt = (
            "你是一个知识整理助手。请将内容整理成 Obsidian 笔记格式，"
            "严格输出 JSON（不要有其他内容）：\n"
            '{"title":"简洁准确的标题","tags":["tag1","tag2"],"summary":"100-200字摘要",'
            '"key_points":["要点1","要点2"],"wikilinks":["相关概念"]}\n'
            "注意：tags 3-5个，key_points 3-6个，wikilinks 最多10个"
        )
        user_prompt = (
            f"{type_desc}的标题是：{title}\n\n"
            f"以下是内容（可能包含英文或中文）：\n{text[:6000]}\n\n"
            "请严格输出 JSON。"
        )
        response = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ], temperature=0.2)
        try:
            return json.loads(response)
        except Exception:
            import re
            m = re.search(r"\{.*\}", response, re.DOTALL)
            if m:
                return json.loads(m.group())
            raise ValueError(f"LLM 返回格式异常: {response[:200]}")
