from fastapi.testclient import TestClient

from backend.main import create_app


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
        assert {"local-time", "notes", "audit"}.issubset(available)
        assert all(item["status"] == "planned" for item in capabilities if item["id"] in {"browser", "home"})


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


def test_unconfigured_connectors_perform_no_action(monkeypatch, tmp_path):
    with make_client(monkeypatch, tmp_path) as api:
        browser = api.post("/api/commands", json={"text": "Open Chrome and search Google"}).json()
        home = api.post("/api/commands", json={"text": "Turn on the AC"}).json()
        assert browser["status"] == "unavailable"
        assert home["status"] == "unavailable"
        assert "No browser was opened" in browser["message"]
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
