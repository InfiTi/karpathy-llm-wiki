"""fetchers: 网页 / 视频 / PDF / Word 内容抓取"""
import os, re, tempfile, subprocess, json as jsonmod
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

VIDEO_HOSTS = (
    "b23.tv", "bilibili.com", "youtube.com", "youtu.be",
    "v.youku.com", "iq.com", "douyin.com", "www.douyin.com",
    "x.com", "twitter.com", "xiaohongshu.com", "www.xiaohongshu.com",
)

def detect_type(user_input):
    user_input = user_input.strip()
    if user_input.startswith("http"):
        host = urlparse(user_input).netloc.lower()
        for vh in VIDEO_HOSTS:
            if vh in host:
                return "video"
        return "web"
    ext = os.path.splitext(user_input)[1].lower()
    if ext == ".pdf": return "pdf"
    if ext in (".docx", ".doc"): return "docx"
    return "web"


def _extract_text_bs5(html, base_url=""):
    """BeautifulSoup 兜底提取，适合 trafilatura 失败的情况"""
    soup = BeautifulSoup(html, "html.parser")
    # 移除无关标签
    for tag in soup(["script", "style", "nav", "header", "footer",
                      "aside", "noscript", "iframe", "svg"]):
        tag.decompose()
    # 取 meta 标题
    title = ""
    og = soup.find("meta", property="og:title")
    if og:
        title = og.get("content", "").strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)
    # 取正文段落
    paras = soup.find_all("p")
    texts = [p.get_text(separator=" ", strip=True)
             for p in paras if len(p.get_text(strip=True)) > 40]
    raw_text = "\n".join(texts)
    # meta 描述
    desc = ""
    md = soup.find("meta", attrs={"name": "description"}) or          soup.find("meta", property="og:description")
    if md:
        desc = md.get("content", "").strip()
    return title, raw_text, desc


def _fetch_web(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    html = resp.text

    # 优先用 trafilatura（提取质量更高）
    title, text, description = "", "", ""
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            result = trafilatura.extract(downloaded, include_comments=False,
                                         include_tables=True, output_format="json")
            if result:
                data = jsonmod.loads(result)
                title = (data.get("title") or "").strip()
                raw = (data.get("raw-text") or "").strip()
                if len(raw) > 100:
                    text = raw
                    description = data.get("description") or ""
    except Exception:
        pass

    # fallback：BeautifulSoup
    if len(text) < 100:
        title2, text2, desc2 = _extract_text_bs5(html, url)
        if not title and title2:
            title = title2
        if len(text2) > len(text):
            text = text2
        if not description and desc2:
            description = desc2

    if not text or len(text) < 50:
        raise ValueError(f"无法提取网页正文: {url}")

    return {
        "type": "web",
        "title": title,
        "text": text,
        "url": url,
        "source_url": url,
        "date": "",
        "description": description,
    }


def _fetch_video(url):
    tmpdir = tempfile.gettempdir()
    info_cmd = ["yt-dlp", "--dump-json", "--no-download", "--no-playlist", url]
    try:
        proc = subprocess.run(info_cmd, capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            raise ValueError(f"yt-dlp 失败: {proc.stderr[:200]}")
        first = proc.stdout.strip().split("\n")[0]
        info = jsonmod.loads(first)
    except Exception as e:
        raise ValueError(f"视频信息获取失败: {e}")

    title = info.get("title") or "untitled"
    description = info.get("description") or ""
    uploader = info.get("uploader") or ""
    duration = info.get("duration") or 0
    subtitle_text = ""

    for lang in ("zh-Hans", "zh-CN", "en"):
        sub_cmd = [
            "yt-dlp", "--write-auto-subs", "--skip-download",
            "--sub-lang", lang, "--convert-subs", "srt",
            "--output", os.path.join(tmpdir, f"kwiki_subs.%(ext)s"),
            "--no-playlist", url
        ]
        try:
            subprocess.run(sub_cmd, capture_output=True, text=True, timeout=120)
            srt_path = os.path.join(tmpdir, f"kwiki_subs.{lang}.srt")
            if os.path.exists(srt_path):
                with open(srt_path, "r", encoding="utf-8") as f:
                    sc = f.read()
                sc = re.sub(r"\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+\n", "", sc)
                sc = re.sub(r"<[^>]+>", "", sc)
                subtitle_text = re.sub(r"\n+", " ", sc).strip()
                if subtitle_text:
                    break
        except Exception:
            pass

    text = subtitle_text if subtitle_text else description
    if not text:
        text = f"视频时长: {int(duration//60)}分{int(duration%60)}秒。描述: {description or '无'}"

    return {
        "type": "video",
        "title": title,
        "text": text[:8000],
        "source_url": url,
        "uploader": uploader,
        "duration": duration,
        "platform": info.get("extractor", ""),
    }


def _fetch_pdf(file_path):
    import fitz
    doc = fitz.open(file_path)
    pages = []
    for i, page in enumerate(doc):
        t = page.get_text("text")
        if t.strip():
            pages.append(f"[第{i+1}页]\n{t}")
    doc.close()
    if not pages:
        raise ValueError(f"PDF 无可提取文字: {file_path}")
    preview = "\n\n".join(pages[:5])
    if len(pages) > 5:
        preview += f"\n\n...（共 {len(pages)} 页）"
    title = os.path.splitext(os.path.basename(file_path))[0]
    return {"type": "pdf", "title": title, "text": preview[:8000],
            "source_url": "", "total_pages": len(pages)}


def _fetch_docx(file_path):
    from docx import Document
    doc = Document(file_path)
    paras = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    if not paras:
        raise ValueError(f"Word 文档无内容: {file_path}")
    text = "\n".join(paras)
    title = os.path.splitext(os.path.basename(file_path))[0]
    return {"type": "docx", "title": title, "text": text[:8000], "source_url": ""}


def fetch_content(user_input, content_type=None):
    if content_type is None:
        content_type = detect_type(user_input)
    user_input = user_input.strip()
    if content_type == "web":   return _fetch_web(user_input)
    if content_type == "video": return _fetch_video(user_input)
    if content_type == "pdf":   return _fetch_pdf(user_input)
    if content_type == "docx": return _fetch_docx(user_input)
    raise ValueError(f"不支持的类型: {content_type}")
