"""ingest: 知识摄入管道 raw/ -> wiki/"""
from .pipeline import run_ingest
from .finder import find_related
__all__ = ["run_ingest", "find_related"]
