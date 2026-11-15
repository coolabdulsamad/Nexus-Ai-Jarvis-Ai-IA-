from fastapi.testclient import TestClient

from backend.main import create_app


MONITOR = {
    "id": 2,
    "left": 1920,
    "top": 0,
    "width": 1920,
    "height": 1080,
    "primary": False,
    "name": "Display 2",
}


def make_client(monkeypatch, tmp_path):
    monkeypatch.setenv("NEXUS_DB_PATH", str(tmp_path / "nexus-test.db"))
    return TestClient(create_app())


def fake_capture(monitor_id):
    assert monitor_id == 2
    return {
        "monitor": MONITOR,
        "image_base64": "cGl4ZWw=",
        "image_width": 800,
        "image_height": 450,
    }


class LocatedAssistant:
    def inspect_screen(self, **kwargs):
        assert kwargs["image_base64"] == "cGl4ZWw="
        assert kwargs["target"] == "play button"
        return {
            "model": "llava:7b",
            "location": {
                "found": True,
                "x": 400,
                "y": 225,
                "confidence": 0.91,
                "description": "A triangular play control is visible in the video player.",
            },
        }


def test_monitor_inventory_is_read_only_and_capture_requires_approval(monkeypatch, tmp_path):
    captures = []
    monkeypatch.setattr("backend.commands.list_monitors", lambda: [MONITOR])
    monkeypatch.setattr("backend.screen.capture_monitor", lambda monitor: captures.append(monitor))
    with make_client(monkeypatch, tmp_path) as api:
        status = api.post("/api/commands", json={"text": "Show monitors"}).json()
        assert status["status"] == "completed"
        assert "monitor 2" in status["message"]
        assert "No screen was captured" in status["message"]

        command = api.post("/api/commands", json={"text": "Click the play button in my second monitor"}).json()
        assert command["intent"] == "screen.locate"
        assert command["status"] == "approval_required"
        assert command["approval"]["payload"]["storage"] == "none"
        assert captures == []

        rejected = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
        assert rejected["command_status"] == "rejected"
        assert "no screen was captured" in rejected["message"]
        assert captures == []


def test_natural_monitor_inspection_accepts_question_marks_and_curly_apostrophes(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.commands.list_monitors", lambda: [MONITOR])
    with make_client(monkeypatch, tmp_path) as api:
        for phrase in ("What am I doing in my first monitor?", "What’s on my first monitor?"):
            command = api.post("/api/commands", json={"text": phrase}).json()
            assert command["intent"] == "screen.capture"
            assert command["status"] == "approval_required"
            assert command["approval"]["payload"]["monitor_id"] == 1
            rejected = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
            assert rejected["command_status"] == "rejected"


def test_target_proposal_needs_separate_exact_coordinate_click_approval(monkeypatch, tmp_path):
    clicks = []
    monkeypatch.setattr("backend.screen.capture_monitor", fake_capture)
    monkeypatch.setattr(
        "backend.screen.click_monitor",
        lambda monitor, x, y: clicks.append((monitor, x, y)) or {"monitor": MONITOR, "x": x, "y": y},
    )
    with make_client(monkeypatch, tmp_path) as api:
        api.app.state.assistant = LocatedAssistant()
        locate = api.post("/api/commands", json={"text": "Click the play button on monitor 2"}).json()
        outcome = api.post(f"/api/approvals/{locate['approval']['id']}/approve").json()
        assert outcome["command_status"] == "completed"
        assert outcome["screen"]["x"] == 2880
        assert outcome["screen"]["y"] == 540
        assert outcome["screen"]["image_data_url"].startswith("data:image/png;base64,")
        assert "Nothing was clicked" in outcome["message"]
        assert clicks == []

        click = api.post(
            "/api/commands",
            json={"text": "Confirm click on monitor 2 at 2880, 540 for play button"},
        ).json()
        assert click["intent"] == "screen.click"
        assert click["status"] == "approval_required"
        assert click["approval"]["payload"]["x"] == 2880
        assert clicks == []

        clicked = api.post(f"/api/approvals/{click['approval']['id']}/approve").json()
        assert clicked["command_status"] == "completed"
        assert clicks == [(2, 2880, 540)]
        assert "One approved left click" in clicked["message"]


def test_uncertain_location_and_vision_failure_never_click(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.screen.capture_monitor", fake_capture)

    class UncertainAssistant:
        def inspect_screen(self, **kwargs):
            return {
                "model": "llava:7b",
                "location": {"found": True, "x": 400, "y": 225, "confidence": 0.2, "description": "Unclear."},
            }

    with make_client(monkeypatch, tmp_path) as api:
        api.app.state.assistant = UncertainAssistant()
        command = api.post("/api/commands", json={"text": "Click play button on monitor 2"}).json()
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["command_status"] == "unavailable"
        assert "Nothing was clicked" in outcome["message"]
        assert "x" not in outcome["screen"]


def test_click_payload_is_revalidated_against_current_monitor_bounds(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.screen.list_monitors", lambda: [MONITOR])
    with make_client(monkeypatch, tmp_path) as api:
        command = api.post("/api/commands", json={"text": "Click monitor 2 at 2000, 500 for play"}).json()
        approval_id = command["approval"]["id"]
        with api.app.state.store.connection() as connection:
            connection.execute(
                "UPDATE approvals SET payload = ? WHERE id = ?",
                ('{"monitor_id": 2, "x": 99999, "y": 500, "target": "play"}', approval_id),
            )
        outcome = api.post(f"/api/approvals/{approval_id}/approve").json()
        assert outcome["command_status"] == "failed"
        assert "outside the current monitor bounds" in outcome["message"]
