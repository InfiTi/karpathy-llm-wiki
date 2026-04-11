
"""config: Vault 路径、LLM 后端配置，持久化到 config.json"""
import json, os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
DEFAULTS = {
    "vault_path": r"F:\Obsidian\AI\llm-wiki",
    "llm_url": "http://localhost:11434/v1",
    "model": "qwen3.5",
    "api_key": "ollama",
}

class Config:
    def __init__(self):
        self._data = DEFAULTS.copy()
        self._load()

    def _load(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    self._data.update(json.load(f))
            except Exception:
                pass

    def save(self):
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False, indent=2)

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
