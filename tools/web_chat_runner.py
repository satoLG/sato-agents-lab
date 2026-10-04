"""Isolated Hermes child process: JSONL progress, no tool execution."""
import contextlib
import json
import os
import sys


def main():
    request = json.load(sys.stdin)
    os.environ["HERMES_SESSION_SOURCE"] = "web_chat"
    sys.path.insert(0, request["root"])
    transport = sys.stdout
    def emit(kind, text):
        transport.write(json.dumps({"kind": kind, "text": str(text)}, ensure_ascii=False) + "\n")
        transport.flush()
    # Hermes UI output is not the transport. Only explicit callback events are.
    with contextlib.redirect_stdout(sys.stderr):
        from cli import HermesCLI
        from model_tools import get_tool_definitions
        from toolsets import validate_toolset
        assert validate_toolset("context_engine")
        assert get_tool_definitions(enabled_toolsets=["context_engine"], quiet_mode=True) == []
        cli = HermesCLI(toolsets=["context_engine"], max_turns=1, run_budget=180, ignore_rules=True)
        if not cli._ensure_runtime_credentials() or not cli._init_agent():
            raise RuntimeError("Hermes initialization failed")
        agent = cli.agent
        if agent.tools:
            raise RuntimeError("Tool isolation failed")
        # Block dispatch as well as definitions, including fabricated tool calls.
        import agent.tool_executor as executor
        def deny_execution(*args, **kwargs):
            raise RuntimeError("Tool execution is disabled in conversation mode")
        executor.execute_tool_calls_concurrent = deny_execution
        executor.execute_tool_calls_sequential = deny_execution
        executor.execute_tool_calls_segmented = deny_execution
        assert get_tool_definitions(enabled_toolsets=["context_engine"], quiet_mode=True) == []
        agent.quiet_mode = True
        agent.suppress_status_output = True
        agent.tool_start_callback = None
        agent.tool_complete_callback = None
        agent.reasoning_callback = None
        agent.stream_delta_callback = None
        agent.tool_gen_callback = None
        agent.step_callback = lambda step, tools: emit("model", f"Consultando o modelo · etapa {step}.")
        def thinking(active=True, *args, **kwargs):
            if active:
                emit("thinking", "O modelo está preparando a resposta.")
        agent.thinking_callback = thinking
        def progress(kind, name=None, preview=None, args=None, **kwargs):
            if kind in {"tool.started", "tool.completed"}:
                raise RuntimeError("Tool execution is disabled in conversation mode")
        agent.tool_progress_callback = progress
        emit("model", "Enviando a mensagem ao modelo configurado no Hermes.")
        result = agent.run_conversation(user_message=request["prompt"], conversation_history=request.get("history", []))
        if not isinstance(result, dict) or result.get("failed") or not result.get("final_response"):
            raise RuntimeError("Hermes returned no answer")
        emit("reply", "Resposta recebida do modelo.")
        emit("answer", result["final_response"])


if __name__ == "__main__":
    main()
