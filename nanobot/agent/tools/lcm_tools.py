"""LCM recall tools for nanobot.

Lossless retrieval of original conversation messages across sessions.
Backed by openlcm (SQLite + FTS5).  Installed into
site-packages/nanobot/agent/tools/ so the ToolLoader auto-discovers it;
implementation lives in ~/.nanobot/lcm/.
"""
from __future__ import annotations

import sys
from pathlib import Path

_LCM_DIR = Path.home() / ".nanobot" / "lcm"
if str(_LCM_DIR) not in sys.path:
    sys.path.insert(0, str(_LCM_DIR))

from nanobot.agent.tools.base import Tool  # noqa: E402

import tools_impl  # noqa: E402
import dag  # noqa: E402

# Start background sync + D1/D2 condensation thread (idempotent).
dag.start_dag_thread()


class LCMGrepTool(Tool):
    name = "lcm_grep"
    description = (
        "全文搜索过去对话的原始消息（跨 session）。当用户询问之前聊过的具体细节、"
        "引用的路径/数字/命令/结论时使用。默认搜索所有 session 的原始消息；"
        "命中后用 lcm_expand(store_id=...) 取完整原文。也搜索摘要节点（含记忆归档摘要）。"
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "搜索关键词（FTS5 语法，AND 匹配）。1-3 个有区分度的词，或带引号的短语。",
            },
            "limit": {"type": "integer", "description": "返回条数（默认 10，上限 200）", "default": 10},
            "sort": {
                "type": "string",
                "enum": ["recency", "relevance", "hybrid"],
                "description": "排序：recency 最新优先，relevance 相关度，hybrid 混合",
                "default": "recency",
            },
            "session_scope": {
                "type": "string",
                "enum": ["all", "session", "current"],
                "description": "all=全部 session；session=指定 session_id；current=当前对话",
                "default": "all",
            },
            "session_id": {
                "type": "string",
                "description": "session_scope=session 时指定，如 telegram:7719625264 或 websocket:xxx",
            },
        },
        "required": ["query"],
    }
    read_only = True

    async def execute(self, query: str, limit: int = 10, sort: str = "recency",
                      session_scope: str = "all", session_id: str | None = None) -> str:
        return tools_impl.do_grep(query, limit=limit, sort=sort,
                                  session_scope=session_scope, session_id=session_id)


class LCMExpandTool(Tool):
    name = "lcm_expand"
    description = (
        "按 store_id 取回一条原始消息的完整内容（跨 session 可用），"
        "或按 node_id 展开摘要节点下的源消息。配合 lcm_grep 使用。"
    )
    parameters = {
        "type": "object",
        "properties": {
            "store_id": {"type": "integer", "description": "原始消息 store_id（来自 lcm_grep 结果）"},
            "node_id": {"type": "integer", "description": "摘要节点 node_id（当前 session 内）"},
            "max_tokens": {"type": "integer", "description": "最大返回 token（默认 4000）", "default": 4000},
        },
    }
    read_only = True

    async def execute(self, store_id: int | None = None, node_id: int | None = None,
                      max_tokens: int = 4000) -> str:
        return tools_impl.do_expand(store_id=store_id, node_id=node_id, max_tokens=max_tokens)


class LCMLoadSessionTool(Tool):
    name = "lcm_load_session"
    description = (
        "分页加载某个 session 的原始消息记录（按时间顺序）。"
        "session_id 形如 telegram:7719625264 或 websocket:606e3b47-...；"
        "用 after_store_id/next_cursor 翻页。"
    )
    parameters = {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "要加载的 session key（必填）"},
            "limit": {"type": "integer", "description": "最多返回条数（默认 100，上限 200）", "default": 100},
            "max_content_chars": {"type": "integer", "description": "每条内容最大字符（默认 4000）", "default": 4000},
            "after_store_id": {"type": "integer", "description": "翻页游标（用上次的 next_cursor）", "default": 0},
        },
        "required": ["session_id"],
    }
    read_only = True

    async def execute(self, session_id: str, limit: int = 100,
                      max_content_chars: int = 4000, after_store_id: int = 0) -> str:
        return tools_impl.do_load_session(session_id, limit=limit,
                                          max_content_chars=max_content_chars,
                                          after_store_id=after_store_id)


class LCMStatusTool(Tool):
    name = "lcm_status"
    description = "LCM 数据库状态：已入库 session 数、消息数、DAG 摘要节点数。"
    parameters = {"type": "object", "properties": {}}
    read_only = True

    async def execute(self) -> str:
        return tools_impl.do_status()


class LCMDescribeTool(Tool):
    name = "lcm_describe"
    description = "查看某个 session 的 DAG 摘要结构（节点深度、覆盖范围）。"
    parameters = {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "可选，查看指定 session 的 DAG"},
        },
    }
    read_only = True

    async def execute(self, session_id: str | None = None) -> str:
        return tools_impl.do_describe(session_id)


class LCMSemanticSearchTool(Tool):
    name = "lcm_semantic_search"
    description = (
        "语义相似度搜索（embedding），按意思而非关键词匹配过去内容。"
        "当 lcm_grep 关键词搜不到但记得大概意思时使用。"
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "要检索的语义描述"},
            "limit": {"type": "integer", "description": "返回条数（默认 10）", "default": 10},
            "content_type": {
                "type": "string",
                "enum": ["all", "node", "fact"],
                "description": "搜索范围：all=节点+事实，node=摘要节点，fact=事实",
                "default": "all",
            },
        },
        "required": ["query"],
    }
    read_only = True

    async def execute(self, query: str, limit: int = 10, content_type: str = "all") -> str:
        return await tools_impl.do_semantic_search(query, limit=limit, content_type=content_type)
