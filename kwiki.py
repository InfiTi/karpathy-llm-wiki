"""
KWiki - Karpathy LLM Wiki 入库工具
Tkinter GUI 窗口
"""
import sys, os, tkinter as tk
from tkinter import ttk, messagebox, filedialog
import threading
from datetime import datetime

from config import Config
from fetchers import detect_type
from llm import LLMClient
from wiki import WikiWriter


class KWikiApp:
    def __init__(self, root):
        self.root = root
        self.root.title("KWiki - Karpathy LLM Wiki 入库工具")
        self.root.geometry("720x650")
        self.root.configure(bg="#f0f2f5")

        self.cfg = Config()
        self.llm_client = None
        self._build_ui()

    # ---- UI 构建 ----
    def _build_ui(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure("BG.TFrame", background="#f0f2f5")
        s.configure("Card.TFrame", background="#ffffff", relief="solid", borderwidth=1)
        s.configure("TLabel", background="#f0f2f5", foreground="#333", font=("Microsoft YaHei", 10))
        s.configure("Title.TLabel", background="#f0f2f5", foreground="#1a73e8",
                     font=("Microsoft YaHei", 18, "bold"))
        s.configure("Card.TLabel", background="#ffffff", foreground="#333", font=("Microsoft YaHei", 10))
        s.configure("Bold.TLabel", background="#ffffff", foreground="#222", font=("Microsoft YaHei", 10, "bold"))
        s.configure("Accent.TButton", font=("Microsoft YaHei", 11, "bold"))

        main = ttk.Frame(self.root, style="BG.TFrame", padding=20)
        main.pack(fill="both", expand=True)

        # 标题栏
        ttk.Label(main, text="📚 KWiki", style="Title.TLabel").pack(anchor="w")
        ttk.Label(main, text="Karpathy LLM Wiki · 知识入库工具",
                  foreground="#888", font=("Microsoft YaHei", 9)).pack(anchor="w", pady=(0, 15))

        # ---- 输入区 ----
        card = ttk.Frame(main, style="Card.TFrame", padding=15)
        card.pack(fill="x", pady=(0, 10))

        ttk.Label(card, text="输入内容", style="Bold.TLabel").pack(anchor="w", pady=(0, 8))

        self.input_var = tk.StringVar()
        entry = ttk.Entry(card, textvariable=self.input_var, font=("Microsoft YaHei", 11))
        entry.pack(fill="x", pady=(0, 8))
        entry.bind("<Return>", lambda e: self._start())
        ttk.Label(card, text="粘贴网页链接 / 视频链接，或点击选择文件",
                  foreground="#999", font=("Microsoft YaHei", 8)).pack(anchor="w")

        # 类型选择
        row = ttk.Frame(card)
        row.pack(fill="x", pady=10)
        ttk.Label(row, text="内容类型:", style="Card.TLabel").pack(side="left", padx=(0, 5))
        self.ctype = tk.StringVar(value="auto")
        for val, lbl in [("auto", "自动检测"), ("web", "网页"), ("video", "视频"),
                          ("pdf", "PDF"), ("docx", "Word")]:
            ttk.Radiobutton(row, text=lbl, value=val, variable=self.ctype).pack(side="left", padx=6)

        # 按钮
        btn_row = ttk.Frame(card)
        btn_row.pack(fill="x", pady=(5, 0))
        ttk.Button(btn_row, text="📄 选择文件", command=self._pick_file).pack(side="left", padx=(0, 8))
        ttk.Button(btn_row, text="▶ 开始入库", style="Accent.TButton", command=self._start).pack(side="left")

        # ---- 设置区 ----
        cfg_card = ttk.Frame(main, style="Card.TFrame", padding=15)
        cfg_card.pack(fill="x", pady=(0, 10))

        ttk.Label(cfg_card, text="⚙️ 入库设置", style="Bold.TLabel").pack(anchor="w", pady=(0, 8))

        # Vault 路径
        r1 = ttk.Frame(cfg_card)
        r1.pack(fill="x", pady=3)
        ttk.Label(r1, text="Vault:", width=10, style="Card.TLabel").pack(side="left", padx=(0, 5))
        self.vault_var = tk.StringVar(value=self.cfg.get("vault_path"))
        ttk.Entry(r1, textvariable=self.vault_var, font=("Microsoft YaHei", 9), width=46).pack(side="left", padx=(0, 5))
        ttk.Button(r1, text="浏览", command=self._browse_vault, width=6).pack(side="left")

        # LLM 配置
        r2 = ttk.Frame(cfg_card)
        r2.pack(fill="x", pady=3)
        ttk.Label(r2, text="LLM 地址:", width=10, style="Card.TLabel").pack(side="left", padx=(0, 5))
        self.llm_url_var = tk.StringVar(value=self.cfg.get("llm_url"))
        ttk.Entry(r2, textvariable=self.llm_url_var, font=("Microsoft YaHei", 9), width=30).pack(side="left", padx=(0, 10))
        ttk.Label(r2, text="模型:", style="Card.TLabel").pack(side="left", padx=(0, 5))
        self.model_var = tk.StringVar(value=self.cfg.get("model"))
        ttk.Entry(r2, textvariable=self.model_var, font=("Microsoft YaHei", 9), width=14).pack(side="left", padx=(0, 10))
        ttk.Button(r2, text="💾 保存", command=self._save_cfg).pack(side="left")

        # ---- 日志区 ----
        ttk.Label(main, text="📋 处理日志", font=("Microsoft YaHei", 10, "bold")).pack(anchor="w", pady=(0, 5))
        log_frame = ttk.Frame(main, style="Card.TFrame", padding=10)
        log_frame.pack(fill="both", expand=True)

        self.log_tv = tk.Text(log_frame, font=("Consolas", 9),
                               bg="#1e1e1e", fg="#cccccc",
                               relief="flat", state="disabled",
                               wrap="word", height=16)
        self.log_tv.pack(fill="both", expand=True)
        scroll = ttk.Scrollbar(log_frame, command=self.log_tv.yview)
        scroll.pack(side="right", fill="y")
        self.log_tv.config(yscrollcommand=scroll.set)

    def _log(self, msg, tag="info"):
        colors = {"info": "#cccccc", "ok": "#4ec9b0", "err": "#f48771", "warn": "#dcdcaa"}
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_tv.config(state="normal")
        self.log_tv.insert("end", f"[{ts}] {msg}\n", tag)
        self.log_tv.tag_config(tag, foreground=colors.get(tag, "#cccccc"))
        self.log_tv.see("end")
        self.log_tv.config(state="disabled")
        self.root.update_idletasks()

    def _pick_file(self):
        path = filedialog.askopenfilename(
            title="选择文件", filetypes=[
                ("文档", "*.pdf *.docx *.doc *.txt"),
                ("PDF", "*.pdf"), ("Word", "*.docx *.doc"),
                ("文本", "*.txt"), ("所有", "*.*")
            ]
        )
        if path:
            self.input_var.set(path)

    def _browse_vault(self):
        path = filedialog.askdirectory(title="选择 Obsidian Vault 根目录")
        if path:
            self.vault_var.set(path)

    def _save_cfg(self):
        self.cfg.set("vault_path", self.vault_var.get().strip())
        self.cfg.set("llm_url", self.llm_url_var.get().strip())
        self.cfg.set("model", self.model_var.get().strip())
        self.cfg.save()
        self._log("✅ 配置已保存", "ok")

    def _start(self):
        inp = self.input_var.get().strip()
        if not inp:
            messagebox.showwarning("输入为空", "请粘贴链接或选择文件")
            return
        vault = self.vault_var.get().strip()
        if not vault:
            messagebox.showwarning("路径为空", "Obsidian Vault 路径不能为空")
            return
        if not os.path.exists(vault):
            messagebox.showerror("路径无效", f"Vault 不存在:\n{vault}")
            return

        # 用最新配置
        self.llm_client = LLMClient(
            self.llm_url_var.get().strip(),
            self.model_var.get().strip()
        )
        self._log(f"🚀 开始: {inp[:80]}", "info")
        t = threading.Thread(target=self._run, args=(inp, vault), daemon=True)
        t.start()

    def _run(self, inp, vault):
        try:
            ctype = self.ctype.get()
            detected = detect_type(inp)
            real_type = ctype if ctype != "auto" else detected
            self._log(f"📌 类型: {real_type}", "info")

            from fetchers import fetch_content
            self._log("⏳ 抓取内容...", "info")
            data = fetch_content(inp, real_type)
            self._log(f"✅ 抓取完成: {data.get('title', 'untitled')}", "ok")

            self._log("🤖 AI 提炼中...", "info")
            refined = self.llm_client.refine_content(
                data["text"], content_type=real_type, title=data.get("title", "")
            )
            self._log("✅ 提炼完成", "ok")

            self._log("💾 写入 Obsidian...", "info")
            writer = WikiWriter(vault)
            path = writer.write(refined, data.get("source_url", ""))
            self._log(f"✅ 已保存: {os.path.basename(path)}", "ok")
            self._log(f"📂 完整路径: {path}", "ok")

        except Exception as e:
            self._log(f"❌ 错误: {e}", "err")
            import traceback
            for line in traceback.format_exc().split("\n")[-4:]:
                if line.strip():
                    self._log(line.strip(), "err")


def main():
    root = tk.Tk()
    KWikiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
