"""KWiki - Karpathy LLM Wiki 入库工具 v0.2.1
三层架构：Ingest / Query / Lint，提示词可配置
"""
import sys, os, tkinter as tk
from tkinter import ttk, messagebox, filedialog
import threading, datetime

import config
import fetchers
from llm import LLMClient
from ingest.pipeline import run_ingest
from query import run_query
from lint import run_lint


class KWikiApp:
    def __init__(self, root):
        self.root = root
        self.root.title("KWiki v0.3.0 - SCHEMA v1.1 Mode")
        self.root.geometry("900x750")
        self.root.configure(bg="#f0f2f5")

        self.cfg = config.Config()
        self.llm_client = None
        self._build_ui()

    # ------------------------------------------------------------------ #
    # UI
    # ------------------------------------------------------------------ #
    def _build_ui(self):
        s = ttk.Style()
        s.theme_use("clam")

        main = ttk.Frame(self.root, padding=15)
        main.pack(fill="both", expand=True)

        ttk.Label(main, text="KWiki v0.3.0", font=("Microsoft YaHei", 16, "bold")).pack(anchor="w")
        ttk.Label(main, text="SCHEMA v1.1 模式  ·  Ingest  ·  Query  ·  Lint",
                  foreground="#888", font=("Microsoft YaHei", 9)).pack(anchor="w", pady=(0, 10))

        nb = ttk.Notebook(main)
        nb.pack(fill="both", expand=True, pady=(0, 10))
        nb.add(self._build_ingest_tab(), text="  Ingest 摄入 ")
        nb.add(self._build_query_tab(), text="  Query 查询 ")
        nb.add(self._build_lint_tab(), text="  Lint 检查 ")
        nb.add(self._build_prompts_tab(), text="  提示词配置 ")

        self._build_footer(main)

    def _build_ingest_tab(self):
        frame = ttk.Frame(self.root)
        card = ttk.Frame(frame, padding=15)
        card.pack(fill="both", expand=True)
        ttk.Label(card, text="知识摄入（Ingest）", font=("Microsoft YaHei", 12, "bold")).pack(anchor="w")
        ttk.Label(card, text="输入链接或选择文件 → raw/ 保存原始内容 → wiki/ 写入结构化笔记",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w", pady=(0, 10))
        self.ingest_var = tk.StringVar()
        ttk.Entry(card, textvariable=self.ingest_var, font=("Microsoft YaHei", 11)).pack(fill="x", pady=(0, 8))
        ttk.Label(card, text="支持：网页 / B站 · YouTube 视频 / PDF / Word",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w")
        row = ttk.Frame(card)
        row.pack(fill="x", pady=10)
        ttk.Button(row, text="选择文件", command=self._pick_file).pack(side="left", padx=(0, 8))
        ttk.Button(row, text="开始摄入", style="Accent.TButton", command=self._do_ingest).pack(side="left")
        self.ingest_progress = ttk.Label(card, text="", foreground="#888", font=("Microsoft YaHei", 9))
        self.ingest_progress.pack(anchor="w", pady=(5, 0))
        self.ingest_log = self._make_log(card)
        return frame

    def _build_query_tab(self):
        frame = ttk.Frame(self.root)
        card = ttk.Frame(frame, padding=15)
        card.pack(fill="both", expand=True)
        ttk.Label(card, text="知识查询（Query）", font=("Microsoft YaHei", 12, "bold")).pack(anchor="w")
        ttk.Label(card, text="向 wiki/ 提问，AI 综合已有知识回答，评估缺口并可回填",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w", pady=(0, 10))
        self.query_var = tk.StringVar()
        ttk.Entry(card, textvariable=self.query_var, font=("Microsoft YaHei", 11)).pack(fill="x", pady=(0, 8))
        ttk.Label(card, text="按回车开始查询",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w")
        row = ttk.Frame(card)
        row.pack(fill="x", pady=10)
        ttk.Button(row, text="开始查询", style="Accent.TButton", command=self._do_query).pack(side="left")
        self.query_result = self._make_log(card)
        return frame

    def _build_lint_tab(self):
        frame = ttk.Frame(self.root)
        card = ttk.Frame(frame, padding=15)
        card.pack(fill="both", expand=True)
        ttk.Label(card, text="质量检查（Lint）", font=("Microsoft YaHei", 12, "bold")).pack(anchor="w")
        ttk.Label(card, text="扫描 wiki/，发现矛盾、过时信息、缺失链接，给出质量评分",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w", pady=(0, 10))
        row = ttk.Frame(card)
        row.pack(fill="x", pady=10)
        ttk.Button(row, text="开始扫描", style="Accent.TButton", command=self._do_lint).pack(side="left")
        self.lint_result = self._make_log(card)
        return frame

    def _build_prompts_tab(self):
        frame = ttk.Frame(self.root)
        card = ttk.Frame(frame, padding=15)
        card.pack(fill="both", expand=True)
        ttk.Label(card, text="提示词配置", font=("Microsoft YaHei", 12, "bold")).pack(anchor="w")
        ttk.Label(card, text="直接编辑提示词模板，保存后立即生效（提示词保存在 config.json）",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w", pady=(0, 8))

        names = [
            ("prompt_ingest_system", "Ingest 系统提示词"),
            ("prompt_ingest_user",   "Ingest 用户提示词模板"),
            ("prompt_query_system",   "Query 系统提示词"),
            ("prompt_query_user",     "Query 用户提示词模板"),
            ("prompt_lint_system",    "Lint 系统提示词"),
            ("prompt_lint_user",      "Lint 用户提示词模板"),
        ]
        self._prompt_entries = {}
        for key, label in names:
            ttk.Label(card, text=label, font=("Microsoft YaHei", 9, "bold")).pack(anchor="w", pady=(8, 2))
            txt = tk.Text(card, font=("Consolas", 8), height=5, wrap="word")
            txt.insert("1.0", self.cfg.get_prompt(key) or "")
            txt.pack(fill="x", pady=(0, 4))
            self._prompt_entries[key] = txt

        ttk.Button(card, text="保存提示词", style="Accent.TButton",
                   command=self._save_prompts).pack(anchor="e", pady=(5, 0))
        return frame

    def _make_log(self, parent):
        txt = tk.Text(parent, font=("Consolas", 9),
                      bg="#1e1e1e", fg="#cccccc", relief="flat",
                      state="disabled", wrap="word")
        txt.pack(fill="both", expand=True, pady=(8, 0))
        return txt

    def _build_footer(self, parent):
        footer = ttk.Frame(parent, padding=10)
        footer.pack(fill="x")
        ttk.Label(footer, text="Vault:").pack(side="left", padx=(0, 5))
        self.vault_var = tk.StringVar(value=self.cfg.get("vault_path"))
        ttk.Entry(footer, textvariable=self.vault_var, font=("Microsoft YaHei", 9), width=40).pack(side="left", padx=(0, 8))
        ttk.Button(footer, text="浏览", command=self._browse_vault, width=6).pack(side="left", padx=(0, 8))
        ttk.Label(footer, text="LLM:").pack(side="left", padx=(0, 5))
        self.llm_url_var = tk.StringVar(value=self.cfg.get("llm_url"))
        ttk.Entry(footer, textvariable=self.llm_url_var, font=("Microsoft YaHei", 9), width=24).pack(side="left", padx=(0, 5))
        ttk.Label(footer, text="Model:").pack(side="left", padx=(0, 5))
        self.model_var = tk.StringVar(value=self.cfg.get("model"))
        ttk.Entry(footer, textvariable=self.model_var, font=("Microsoft YaHei", 9), width=12).pack(side="left", padx=(0, 8))
        ttk.Button(footer, text="保存", command=self._save_cfg).pack(side="left")

    # ------------------------------------------------------------------ #
    # 操作
    # ------------------------------------------------------------------ #
    def _log(self, widget, msg, tag="info"):
        colors = {"info": "#cccccc", "ok": "#4ec9b0", "err": "#f48771",
                   "warn": "#dcdcaa", "title": "#569cd6"}
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        widget.config(state="normal")
        widget.insert("end", f"[{ts}] {msg}\n", tag)
        for t, c in colors.items():
            widget.tag_config(t, foreground=c)
        widget.see("end")
        widget.config(state="disabled")

    def _pick_file(self):
        path = filedialog.askopenfilename(
            title="选择文件",
            filetypes=[("文档", "*.pdf *.docx *.doc *.txt"), ("所有", "*.*")])
        if path:
            self.ingest_var.set(path)

    def _browse_vault(self):
        path = filedialog.askdirectory(title="选择 Obsidian Vault 目录")
        if path:
            self.vault_var.set(path)

    def _save_cfg(self):
        self.cfg.set("vault_path", self.vault_var.get().strip())
        self.cfg.set("llm_url", self.llm_url_var.get().strip())
        self.cfg.set("model", self.model_var.get().strip())
        self.cfg.save()
        self.llm_client = None
        self._log(self.ingest_log, "配置已保存", "ok")

    def _save_prompts(self):
        for key, txt in self._prompt_entries.items():
            self.cfg.set_prompt(key, txt.get("1.0", "end-1c"))
        self.cfg.save()
        self._log(self.ingest_log, "提示词已保存，立即生效", "ok")

    def _get_llm(self):
        if self.llm_client is None:
            self.llm_client = LLMClient(
                self.llm_url_var.get().strip(),
                self.model_var.get().strip(),
                enable_thinking=self.cfg.get("enable_thinking", False),
            )
        return self.llm_client

    # ---- Ingest ---- #
    def _do_ingest(self):
        inp = self.ingest_var.get().strip()
        vault = self.vault_var.get().strip()
        if not inp:
            messagebox.showwarning("输入为空", "请粘贴链接或选择文件")
            return
        if not vault:
            messagebox.showerror("路径无效", "请设置 Vault 路径")
            return
        self._log(self.ingest_log, f"摄入: {inp[:80]}", "info")
        self.ingest_progress.config(text="处理中...")
        t = threading.Thread(target=self._ingest_bg, args=(inp, vault), daemon=True)
        t.start()

    def _ingest_bg(self, inp, vault):
        try:
            ctype = fetchers.detect_type(inp)
            self._log(self.ingest_log, f"[1/6] 类型检测: {ctype}", "info")

            self._log(self.ingest_log, f"[2/6] 正在抓取内容...", "info")
            data = fetchers.fetch_content(inp, ctype)
            self._log(self.ingest_log, f"[3/6] 抓取完成: {data.get('title', 'untitled')[:40]} ({len(data.get('text',''))} 字)", "ok")

            llm = self._get_llm()
            self._log(self.ingest_log, f"[4/6] LLM 编译开始（耐心等待，约 30-120s）...", "info")
            result = run_ingest(vault, data["text"], inp, ctype,
                               data.get("title", ""), llm, cfg=self.cfg)
            self._log(self.ingest_log, f"[5/6] raw/ 已写入: {result['raw']}", "info")
            self._log(self.ingest_log, f"[6/6] wiki/ 已写入 {len(result['wiki'])} 个页面", "ok")
            self.ingest_progress.config(text=f"完成: {result['wiki']}")
        except Exception as e:
            import traceback
            self._log(self.ingest_log, f"错误: {e}", "err")
            for line in traceback.format_exc().split("\n")[-3:]:
                if line.strip():
                    self._log(self.ingest_log, line.strip(), "err")

    # ---- Query ---- #
    def _do_query(self):
        q = self.query_var.get().strip()
        vault = self.vault_var.get().strip()
        if not q:
            messagebox.showwarning("问题为空", "请输入要查询的问题")
            return
        if not vault:
            messagebox.showerror("路径无效", "请设置 Vault 路径")
            return
        self._log(self.query_result, f"问题: {q}", "info")
        t = threading.Thread(target=self._query_bg, args=(q, vault), daemon=True)
        t.start()

    def _query_bg(self, q, vault):
        try:
            llm = self._get_llm()
            result = run_query(q, vault, llm, cfg=self.cfg)
            self._log(self.query_result, f"回答:\n{result.get('answer','')[:600]}", "ok")
            if result.get("sources"):
                self._log(self.query_result, f"来源: {', '.join(result['sources'][:5])}", "title")
            if result.get("gaps"):
                self._log(self.query_result, f"知识缺口: {', '.join(result['gaps'])}", "warn")
            self._log(self.query_result, f"置信度: {result.get('confidence','?')}", "info")
        except Exception as e:
            self._log(self.query_result, f"错误: {e}", "err")

    # ---- Lint ---- #
    def _do_lint(self):
        vault = self.vault_var.get().strip()
        if not vault:
            messagebox.showerror("路径无效", "请设置 Vault 路径")
            return
        self._log(self.lint_result, "开始扫描 wiki/ ...", "info")
        t = threading.Thread(target=self._lint_bg, args=(vault,), daemon=True)
        t.start()

    def _lint_bg(self, vault):
        try:
            llm = self._get_llm()
            report = run_lint(vault, llm, cfg=self.cfg)
            score = report.get("score", "?")
            self._log(self.lint_result, f"质量评分: {score} / 100",
                       "ok" if isinstance(score, int) and score >= 70 else "warn")
            stats = report.get("stats", {})
            self._log(self.lint_result,
                       f"条目: {stats.get('total_entries',0)}  链接: {stats.get('total_links',0)}",
                       "title")
            issues = report.get("issues", [])
            self._log(self.lint_result,
                       f"发现问题: {len(issues)} 个",
                       "warn" if issues else "ok")
            for issue in issues[:10]:
                tag = "warn" if issue.get("severity") in ("high","medium") else "info"
                self._log(self.lint_result,
                           f"[{issue.get('severity','?')}] {issue.get('title','')}: {issue.get('description','')}",
                           tag)
        except Exception as e:
            self._log(self.lint_result, f"错误: {e}", "err")


def main():
    root = tk.Tk()
    KWikiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
