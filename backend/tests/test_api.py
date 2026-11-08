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
        assert {"assistant", "local-time", "notes", "audit", "browser", "terminal", "devices", "camera"}.issubset(available)
        assert all(item["status"] == "planned" for item in capabilities if item["id"] in {"home", "mobile"})


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
            "model_enabled": True,
            "model_name": "qwen2.5:3b",
            "wake_word": "Nexus",
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
        assert api.post("/api/settings", json={"wake_word": "<script>"}).status_code == 422
        assert api.post("/api/settings", json={"wake_word": "  Jarvis  "}).json()["wake_word"] == "Jarvis"

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



def test_console_browser_approval_uses_client_handoff(monkeypatch, tmp_path):
    launched = []
    monkeypatch.setattr(
        "backend.connectors.subprocess.Popen",
        lambda *args, **kwargs: launched.append((args, kwargs)),
    )
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Open example.com"}).json()
        outcome = api.post(
            f"/api/approvals/{command['approval']['id']}/approve",
            json={"client_browser": True},
        ).json()
        assert outcome["command_status"] == "completed"
        assert outcome["payload"]["url"] == "https://example.com"
        assert "this browser" in outcome["message"]
        assert launched == []


def test_typed_memory_requires_approval_and_persists(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Remember preference: I prefer concise answers"},
        ).json()
        assert command["intent"] == "memory.create"
        assert command["status"] == "approval_required"
        assert api.get("/api/memories").json()["memories"] == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["memory"]["kind"] == "preference"
        assert outcome["memory"]["content"] == "I prefer concise answers"
        memories = api.get("/api/memories?kind=preference").json()["memories"]
        assert len(memories) == 1
        assert api.get("/api/memories?kind=device").json()["memories"] == []
        assert api.get("/api/health").json()["memory_records"] == 1

    with make_client(monkeypatch, tmp_path) as restarted:
        memories = restarted.get("/api/memories").json()["memories"]
        assert memories[0]["content"] == "I prefer concise answers"


def test_rejected_typed_memory_creates_no_record(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Remember device: Office sensor hub"},
        ).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
        assert outcome["command_status"] == "rejected"
        assert outcome["memory"] is None
        assert api.get("/api/memories").json()["memories"] == []


def test_conversation_timeline_tracks_command_outcomes(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        completed = api.post("/api/commands", json={"text": "What time is it?"}).json()
        pending = api.post("/api/commands", json={"text": "Show Git status"}).json()
        api.post(f"/api/approvals/{pending['approval']['id']}/reject")

        conversations = api.get("/api/conversations").json()["conversations"]
        by_id = {entry["id"]: entry for entry in conversations}
        assert by_id[completed["command_id"]]["status"] == "completed"
        assert "UTC" in by_id[completed["command_id"]]["response"]
        assert by_id[pending["command_id"]]["status"] == "rejected"
        assert api.get("/api/health").json()["conversations"] == 2

        listed = api.post("/api/commands", json={"text": "Show memory"}).json()
        assert listed["status"] == "completed"
        assert "No typed memories" in listed["message"]


def test_android_registration_requires_approval_and_persists(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Register Android device: Sam's phone"}
        ).json()
        assert command["intent"] == "device.register"
        assert command["status"] == "approval_required"
        assert command["approval"]["payload"] == {
            "platform": "android",
            "name": "Sam's phone",
        }
        assert api.get("/api/devices").json()["devices"] == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["command_status"] == "completed"
        assert outcome["device"]["connection_status"] == "not_connected"
        assert "no remote control was enabled" in outcome["message"]

        devices = api.get("/api/devices").json()["devices"]
        assert len(devices) == 1
        assert devices[0]["label"] == "Android"
        assert devices[0]["connection_status"] == "not_connected"
        assert "No companion app is paired" in devices[0]["limitations"]
        assert api.get("/api/health").json()["devices"] == 1

    with make_client(monkeypatch, tmp_path) as restarted:
        devices = restarted.get("/api/devices").json()["devices"]
        assert devices[0]["name"] == "Sam's phone"
        assert devices[0]["platform"] == "android"


def test_rejected_iphone_registration_creates_no_device(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post(
            "/api/commands", json={"text": "Register iPhone device: Office iPhone"}
        ).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
        assert outcome["command_status"] == "rejected"
        assert outcome["device"] is None
        assert "no device was registered or connected" in outcome["message"]
        assert api.get("/api/devices").json()["devices"] == []


def test_device_listing_and_home_status_are_honest(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        empty = api.post("/api/commands", json={"text": "Show devices"}).json()
        assert empty["status"] == "completed"
        assert "No owned devices" in empty["message"]

        home = api.post("/api/commands", json={"text": "Home status"}).json()
        assert home["intent"] == "home.status"
        assert home["status"] == "unavailable"
        assert "no home device was contacted or changed" in home["message"]
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_registration_rejects_unknown_platform_and_oversized_name(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        unknown = api.post("/api/commands", json={"text": "Register Windows device: Laptop"}).json()
        assert unknown["intent"] == "device.unsupported"
        assert unknown["status"] == "unsupported"

        oversized = api.post(
            "/api/commands", json={"text": "Register Android device: " + "x" * 81}
        ).json()
        assert oversized["intent"] == "device.unsupported"
        assert api.get("/api/devices").json()["devices"] == []
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []



def test_camera_preview_requires_approval_and_rejection_starts_nothing(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Start camera preview"}).json()
        assert command["intent"] == "camera.preview"
        assert command["status"] == "approval_required"
        assert command["approval"]["payload"] == {
            "video": True,
            "audio": False,
            "recording": False,
            "storage": "none",
        }
        assert api.get("/api/camera/sessions").json()["sessions"] == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
        assert outcome["command_status"] == "rejected"
        assert outcome["camera_session"] is None
        assert "camera access was not requested" in outcome["message"]
        assert api.get("/api/camera/sessions").json()["sessions"] == []


def test_camera_approval_and_browser_reported_lifecycle_persist(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Start webcam"}).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        session = outcome["camera_session"]
        assert session["status"] == "approved"
        assert "no video is active yet" in outcome["message"]

        started = api.post(
            f"/api/camera/sessions/{session['id']}/events", json={"event": "started"}
        )
        assert started.status_code == 200
        assert started.json()["session"]["status"] == "active"
        assert api.get("/api/health").json()["camera_sessions"] == 1

        stopped = api.post(
            f"/api/camera/sessions/{session['id']}/events", json={"event": "stopped"}
        )
        assert stopped.json()["session"]["status"] == "stopped"
        events = api.get("/api/audit").json()["events"]
        assert {"camera.started", "camera.stopped"}.issubset(
            {event["event_type"] for event in events}
        )

    with make_client(monkeypatch, tmp_path) as restarted:
        sessions = restarted.get("/api/camera/sessions").json()["sessions"]
        assert sessions[0]["status"] == "stopped"


def test_camera_denial_is_unavailable_not_active(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Open camera preview"}).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        session_id = outcome["camera_session"]["id"]
        denied = api.post(
            f"/api/camera/sessions/{session_id}/events", json={"event": "unavailable"}
        )
        assert denied.status_code == 200
        assert denied.json()["session"]["status"] == "unavailable"

        status = api.post("/api/commands", json={"text": "Camera status"}).json()
        assert status["status"] == "completed"
        assert "unavailable or denied" in status["message"]
        assert "no preview is active" in status["message"]


def test_camera_session_rejects_invalid_transitions_and_unknown_events(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        empty_status = api.post("/api/commands", json={"text": "Camera status"}).json()
        assert "has not accessed a camera" in empty_status["message"]

        command = api.post("/api/commands", json={"text": "Start camera"}).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        session_id = outcome["camera_session"]["id"]
        assert api.post(
            f"/api/camera/sessions/{session_id}/events", json={"event": "recorded"}
        ).status_code == 422

        api.post(f"/api/camera/sessions/{session_id}/events", json={"event": "stopped"})
        invalid = api.post(
            f"/api/camera/sessions/{session_id}/events", json={"event": "started"}
        )
        assert invalid.status_code == 409
        assert api.get("/api/camera/sessions/not-real/events").status_code in {404, 405}
        missing = api.post(
            "/api/camera/sessions/not-real/events", json={"event": "started"}
        )
        assert missing.status_code == 404
