from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.main import create_app


def client(tmp_path):
    app = create_app()
    app.state_path = tmp_path
    return TestClient(app)


def make_client(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_DB_PATH", str(tmp_path / "nexus-test.db"))
    return TestClient(create_app())


def test_health_and_capabilities(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        health = api.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "online"
        assert health.json()["database"] == "sqlite"

        capabilities = api.get("/api/capabilities").json()["capabilities"]
        available = {item["id"] for item in capabilities if item["status"] == "available"}
        assert {"local-time", "notes", "audit", "browser", "terminal"}.issubset(available)
        assert all(item["status"] == "planned" for item in capabilities if item["id"] == "home")


def test_read_only_time_command(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        response = api.post("/api/commands", json={"text": "What time is it?"})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "system.time"
        assert body["status"] == "completed"
        assert "UTC" in body["message"]
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_note_requires_approval_then_persists(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Take a note: buy ESP32-CAM"}
        ).json()
        assert command["status"] == "approval_required"
        approval_id = command["approval"]["id"]
        assert api.get("/api/notes").json()["notes"] == []

        approved = api.post(f"/api/approvals/{approval_id}/approve")
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert approved.json()["note"]["content"] == "buy ESP32-CAM"

        notes = api.get("/api/notes").json()["notes"]
        assert len(notes) == 1
        assert notes[0]["content"] == "buy ESP32-CAM"
        duplicate = api.post(f"/api/approvals/{approval_id}/approve")
        assert duplicate.status_code == 409
        assert len(api.get("/api/notes").json()["notes"]) == 1


def test_rejected_note_creates_no_memory(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Remember that this is private"}).json()
        rejected = api.post(f"/api/approvals/{command['approval']['id']}/reject")
        assert rejected.status_code == 200
        assert rejected.json()["status"] == "rejected"
        assert rejected.json()["note"] is None
        assert api.get("/api/notes").json()["notes"] == []


def test_unconfigured_home_connector_performs_no_action(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        home = api.post("/api/commands", json={"text": "Turn on the AC"}).json()
        assert home["status"] == "unavailable"
        assert "No AC" in home["message"]
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_audit_trail_and_restart_persistence(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Note: persistent memory"}).json()
        api.post(f"/api/approvals/{command['approval']['id']}/approve")
        event_types = {event["event_type"] for event in api.get("/api/audit").json()["events"]}
        assert {"command.received", "approval.requested", "approval.approved"}.issubset(event_types)

    with make_client(monkeypatch, tmp_path) as restarted:
        notes = restarted.get("/api/notes").json()["notes"]
        assert len(notes) == 1
        assert notes[0]["content"] == "persistent memory"


def test_validation_and_unknown_approval(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        assert api.post("/api/commands", json={"text": ""}).status_code == 422
        assert api.post("/api/approvals/not-real/approve").status_code == 404


def test_voice_and_avatar_settings_persist(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        defaults = api.get("/api/settings")
        assert defaults.status_code == 200
        assert defaults.json() == {
            "assistant_name": "Nexus",
            "voice_enabled": True,
            "voice_rate": 1.0,
            "avatar_mode": "globe",
        }

        updated = api.post(
            "/api/settings",
            json={
                "assistant_name": "  Jarvis  ",
                "voice_enabled": False,
                "voice_rate": 1.2,
                "avatar_mode": "humanoid",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["assistant_name"] == "Jarvis"
        assert updated.json()["voice_enabled"] is False
        assert updated.json()["avatar_mode"] == "humanoid"
        status = api.post("/api/commands", json={"text": "System status"}).json()
        assert status["message"].startswith("Jarvis local core is online")

    with make_client(monkeypatch, tmp_path) as restarted:
        settings = restarted.get("/api/settings").json()
        assert settings["assistant_name"] == "Jarvis"
        assert settings["voice_rate"] == 1.2
        assert settings["avatar_mode"] == "humanoid"
        event_types = {event["event_type"] for event in restarted.get("/api/audit").json()["events"]}
        assert "settings.updated" in event_types


def test_settings_validation_and_partial_update(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        assert api.post("/api/settings", json={"assistant_name": "   "}).status_code == 422
        assert api.post("/api/settings", json={"voice_rate": 2.0}).status_code == 422
        assert api.post("/api/settings", json={"avatar_mode": "robot"}).status_code == 422

        response = api.post("/api/settings", json={"avatar_mode": "humanoid"})
        assert response.status_code == 200
        assert response.json()["assistant_name"] == "Nexus"
        assert response.json()["voice_enabled"] is True


def test_browser_search_requires_approval_then_launches_exact_url(monkeypatch, tmp_path):
    launched = []
    monkeypatch.setattr(
        "backend.connectors._chrome_command",
        lambda url: (["chrome-test", url], "Google Chrome"),
    )
    monkeypatch.setattr(
        "backend.connectors.subprocess.Popen",
        lambda command, **kwargs: launched.append((command, kwargs)),
    )
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Open Chrome and search Google for local AI"}
        ).json()
        assert command["status"] == "approval_required"
        assert command["intent"] == "browser.search"
        assert command["approval"]["payload"]["url"] == (
            "https://www.google.com/search?q=local+AI"
        )
        assert launched == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["status"] == "approved"
        assert outcome["command_status"] == "completed"
        assert len(launched) == 1
        assert launched[0][0] == [
            "chrome-test",
            "https://www.google.com/search?q=local+AI",
        ]
        assert launched[0][1]["stdout"] is not None


def test_rejected_browser_and_terminal_requests_do_nothing(monkeypatch, tmp_path):
    launched = []
    monkeypatch.setattr(
        "backend.connectors._chrome_command",
        lambda url: (["chrome-test", url], "Google Chrome"),
    )
    monkeypatch.setattr(
        "backend.connectors.subprocess.Popen",
        lambda command, **kwargs: launched.append(command),
    )
    monkeypatch.setattr(
        "backend.connectors.subprocess.run",
        lambda *args, **kwargs: launched.append("terminal"),
    )
    with make_client(monkeypatch, tmp_path) as api:
        browser = api.post("/api/commands", json={"text": "Open example.com"}).json()
        terminal = api.post("/api/commands", json={"text": "Show Git status"}).json()
        api.post(f"/api/approvals/{browser['approval']['id']}/reject")
        api.post(f"/api/approvals/{terminal['approval']['id']}/reject")
        assert launched == []
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_browser_blocks_unsafe_schemes_and_credentials(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        for text in (
            "Open javascript:alert(1)",
            "Open file:///etc/passwd",
            "Open https://user:password@example.com",
        ):
            response = api.post("/api/commands", json={"text": text}).json()
            assert response["status"] == "unsupported"
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_git_status_uses_fixed_argv_and_returns_output(monkeypatch, tmp_path):
    calls = []

    def fake_run(*args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(returncode=0, stdout="## main\n M README.md\n", stderr="")

    monkeypatch.setattr("backend.connectors.subprocess.run", fake_run)
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Show Git status"}).json()
        assert command["status"] == "approval_required"
        assert command["approval"]["payload"]["display_command"] == "git status --short --branch"
        assert calls == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["command_status"] == "completed"
        assert " M README.md" in outcome["output"]
        assert len(calls) == 1
        args, kwargs = calls[0]
        assert args[0] == ["git", "status", "--short", "--branch"]
        assert kwargs["shell"] is False
        assert kwargs["timeout"] == 6
        assert kwargs["check"] is False


def test_arbitrary_terminal_commands_are_not_accepted(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        response = api.post(
            "/api/commands", json={"text": "Open terminal and run rm -rf /"}
        ).json()
        assert response["status"] == "unsupported"
        assert response["intent"] == "terminal.unsupported"
        assert "No arbitrary terminal command was run" in response["message"]
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_browser_unavailable_is_reported_honestly(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.connectors._chrome_command", lambda url: None)
    monkeypatch.setattr("backend.connectors.webbrowser.open", lambda url, new: False)
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Open https://example.com"}).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["status"] == "approved"
        assert outcome["command_status"] == "unavailable"
        assert "Nothing was launched" in outcome["message"]
