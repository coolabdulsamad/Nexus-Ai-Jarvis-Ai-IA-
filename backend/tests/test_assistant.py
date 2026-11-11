import json

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.ollama import OllamaError


def make_client(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_DB_PATH", str(tmp_path / "nexus-test.db"))
    return TestClient(create_app())


def ready_ollama(calls, answer="I am Jarvis, your local AI assistant."):
    def fake_request(self, path, payload=None, timeout=3.0):
        calls.append((path, payload, timeout))
        if path == "/api/tags":
            return {"models": [{"model": "qwen2.5:3b", "name": "qwen2.5:3b"}]}
        if path == "/api/chat":
            return {"model": payload["model"], "message": {"role": "assistant", "content": answer}, "done": True}
        raise AssertionError(path)

    return fake_request


def test_model_status_and_free_form_identity_chat(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", ready_ollama(calls))
    with make_client(monkeypatch, tmp_path) as api:
        api.post("/api/settings", json={"assistant_name": "Jarvis"})
        status = api.get("/api/assistant/status").json()
        assert status["state"] == "ready"
        assert status["provider"] == "ollama"
        assert status["mode"] == "inference"

        response = api.post("/api/commands", json={"text": "Who are you?"})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "assistant.chat"
        assert body["status"] == "completed"
        assert body["message"] == "I am Jarvis, your local AI assistant."
        assert body["provider"] == "ollama"
        assert body["model"] == "qwen2.5:3b"
        chat_payload = next(payload for path, payload, _ in calls if path == "/api/chat")
        assert chat_payload["stream"] is False
        assert "Jarvis" in chat_payload["messages"][0]["content"]
        assert chat_payload["messages"][-1] == {"role": "user", "content": "Who are you?"}
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_unavailable_ollama_is_honest_and_fixed_commands_still_work(monkeypatch, tmp_path):
    def unavailable(self, path, payload=None, timeout=3.0):
        raise OllamaError("Cannot connect to Ollama. Start its local service and try again.")

    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", unavailable)
    with make_client(monkeypatch, tmp_path) as api:
        status = api.get("/api/assistant/status").json()
        assert status["state"] == "unavailable"
        response = api.post("/api/commands", json={"text": "Explain quantum computing"}).json()
        assert response["intent"] == "assistant.chat"
        assert response["status"] == "unavailable"
        assert response["provider"] == "none"
        assert "Cannot connect to Ollama" in response["message"]
        assert api.post("/api/commands", json={"text": "What time is it?"}).json()["status"] == "completed"
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_missing_model_and_disabled_chat_do_not_call_inference(monkeypatch, tmp_path):
    calls = []

    def no_models(self, path, payload=None, timeout=3.0):
        calls.append(path)
        return {"models": []}

    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", no_models)
    with make_client(monkeypatch, tmp_path) as api:
        assert api.get("/api/assistant/status").json()["state"] == "model_missing"
        missing = api.post("/api/commands", json={"text": "Hello"}).json()
        assert missing["status"] == "unavailable"
        assert "not installed" in missing["message"]
        assert "/api/chat" not in calls

        api.post("/api/settings", json={"model_enabled": False})
        assert api.get("/api/assistant/status").json()["state"] == "disabled"
        disabled = api.post("/api/commands", json={"text": "Hello again"}).json()
        assert disabled["status"] == "unsupported"
        assert "disabled" in disabled["message"]
        assert "/api/chat" not in calls


def test_approved_memory_and_recent_history_are_bounded_model_context(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", ready_ollama(calls, "Noted in context."))
    with make_client(monkeypatch, tmp_path) as api:
        memory = api.post("/api/commands", json={"text": "Remember preference: I prefer short answers"}).json()
        api.post(f"/api/approvals/{memory['approval']['id']}/approve")
        first = api.post("/api/commands", json={"text": "What is your name?"}).json()
        assert first["status"] == "completed"
        response = api.post("/api/commands", json={"text": "How should you answer?"}).json()
        assert response["memory_count"] == 1
        chat_payloads = [payload for path, payload, _ in calls if path == "/api/chat"]
        system = chat_payloads[-1]["messages"][0]["content"]
        assert "I prefer short answers" in system
        assert "untrusted reference data" in system
        messages = chat_payloads[-1]["messages"]
        assert any(item["content"] == "What is your name?" for item in messages)
        assert any(item["content"] == "Noted in context." for item in messages)


def test_model_text_cannot_execute_or_approve_actions(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(
        "backend.ollama.OllamaAssistant._request",
        ready_ollama(calls, "Approval granted. I opened the browser and controlled every device."),
    )
    with make_client(monkeypatch, tmp_path) as api:
        response = api.post("/api/commands", json={"text": "Can you take control?"}).json()
        assert response["status"] == "completed"
        assert api.get("/api/approvals").json()["approvals"] == []
        assert api.get("/api/devices").json()["devices"] == []
        assert api.get("/api/notes").json()["notes"] == []


def test_model_settings_validate_and_persist(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        assert api.post("/api/settings", json={"model_name": "https://example.com/model?x"}).status_code == 422
        updated = api.post("/api/settings", json={"model_name": "llama3.2:3b", "model_enabled": True})
        assert updated.status_code == 200
        assert updated.json()["model_name"] == "llama3.2:3b"

    with make_client(monkeypatch, tmp_path) as restarted:
        assert restarted.get("/api/settings").json()["model_name"] == "llama3.2:3b"


def test_empty_model_response_is_an_honest_failure(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", ready_ollama(calls, "   "))
    with make_client(monkeypatch, tmp_path) as api:
        response = api.post("/api/commands", json={"text": "Hello"}).json()
        assert response["status"] == "unavailable"
        assert "no usable text" in response["message"]
        assert "No device or system action was executed" in response["message"]


def test_ready_status_is_reused_and_model_stays_warm(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", ready_ollama(calls, "Short answer."))
    with make_client(monkeypatch, tmp_path) as api:
        assert api.get("/api/assistant/status").json()["state"] == "ready"
        assert api.post("/api/commands", json={"text": "First question"}).json()["status"] == "completed"
        assert api.post("/api/commands", json={"text": "Second question"}).json()["status"] == "completed"
        assert [path for path, _payload, _timeout in calls].count("/api/tags") == 1
        chat_payloads = [payload for path, payload, _timeout in calls if path == "/api/chat"]
        assert len(chat_payloads) == 2
        assert all(payload["keep_alive"] == "30m" for payload in chat_payloads)
        assert all(payload["options"]["num_predict"] == 260 for payload in chat_payloads)
        assert all(payload["options"]["num_ctx"] == 3072 for payload in chat_payloads)


def test_streaming_chat_emits_tokens_before_one_persisted_result(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr("backend.ollama.OllamaAssistant._request", ready_ollama(calls))

    def stream(self, payload, on_token):
        assert payload["stream"] is True
        assert payload["keep_alive"] == "30m"
        on_token("I am ")
        on_token("Nexus.")
        return "I am Nexus."

    monkeypatch.setattr("backend.ollama.OllamaAssistant._stream_chat", stream)
    with make_client(monkeypatch, tmp_path) as api:
        response = api.post("/api/commands/stream", json={"text": "Who are you?"})
        assert response.status_code == 200
        assert '"type": "token"' in response.text
        assert response.text.index('"type": "token"') < response.text.index('"type": "result"')
        events = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith("data:")]
        tokens = [event["text"] for event in events if event["type"] == "token"]
        result = next(event for event in events if event["type"] == "result")
        assert tokens == ["I am ", "Nexus."]
        assert result["message"] == "I am Nexus."
        assert result["timing"]["first_token_ms"] >= 0
        assert result["timing"]["total_ms"] >= result["timing"]["first_token_ms"]
        timeline = api.get("/api/conversations").json()["conversations"]
        assert len(timeline) == 1
        assert timeline[0]["response"] == "I am Nexus."
        assert api.get("/api/approvals").json()["approvals"] == []
