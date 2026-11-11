from fastapi.testclient import TestClient

from backend.main import create_app


def make_client(monkeypatch, tmp_path):
    root = tmp_path / "home"
    root.mkdir()
    monkeypatch.setenv("NEXUS_DB_PATH", str(tmp_path / "nexus-test.db"))
    monkeypatch.setenv("NEXUS_SYSTEM_ROOTS", str(root))
    return TestClient(create_app()), root


def test_directory_discovery_is_bounded_and_skips_hidden_and_symlinks(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    (root / "Projects").mkdir()
    (root / "Projects" / "Nexus").mkdir()
    (root / ".private").mkdir()
    (root / "notes.txt").write_text("do not read this")
    try:
        (root / "linked").symlink_to(tmp_path, target_is_directory=True)
    except OSError:
        pass

    with api:
        response = api.get("/api/system/directories?query=proj")
        assert response.status_code == 200
        body = response.json()
        assert [item["name"] for item in body["directories"]] == ["Projects"]
        assert body["roots"] == [str(root.resolve())]
        assert body["max_depth"] == 2
        assert "notes.txt" not in response.text
        all_directories = api.get("/api/system/directories").json()["directories"]
        names = {item["name"] for item in all_directories}
        assert ".private" not in names
        assert "linked" not in names


def test_folder_in_vscode_requires_approval_and_uses_fixed_argv(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    project = root / "Projects"
    project.mkdir()
    launches = []
    monkeypatch.setattr("backend.system._application_executable", lambda app: "/usr/bin/code" if app == "vscode" else None)
    monkeypatch.setattr("backend.system._launch", lambda command: launches.append(command))

    with api:
        command = api.post("/api/commands", json={"text": "Open Projects in VS Code"}).json()
        assert command["intent"] == "system.open_folder"
        assert command["status"] == "approval_required"
        assert command["approval"]["payload"] == {
            "path": str(project.resolve()),
            "name": "Projects",
            "application": "vscode",
        }
        assert launches == []

        outcome = api.post(f"/api/approvals/{command['approval']['id']}/approve").json()
        assert outcome["command_status"] == "completed"
        assert launches == [["/usr/bin/code", "--new-window", str(project.resolve())]]
        assert api.post(f"/api/approvals/{command['approval']['id']}/approve").status_code == 409
        assert len(launches) == 1


def test_ambiguous_and_missing_folders_create_no_launch_approval(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    (root / "one").mkdir()
    (root / "two").mkdir()
    (root / "one" / "Projects").mkdir()
    (root / "two" / "Projects").mkdir()

    with api:
        ambiguous = api.post("/api/commands", json={"text": "Open folder Projects in VS Code"}).json()
        assert ambiguous["status"] == "unavailable"
        assert len(ambiguous["directories"]) == 2
        assert "Which exact folder" in ambiguous["message"]
        assert ambiguous["follow_up"] == {"kind": "system.folder", "application": "vscode"}

        missing = api.post("/api/commands", json={"text": "Open folder DoesNotExist in VS Code"}).json()
        assert missing["status"] == "unavailable"
        assert "No folder was opened" in missing["message"]
        assert api.get("/api/approvals?status=pending").json()["approvals"] == []


def test_incomplete_folder_request_asks_for_clarification_without_approval(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    (root / "Projects").mkdir()
    with api:
        clarification = api.post("/api/commands", json={"text": "Open a folder"}).json()
        assert clarification["intent"] == "system.clarify_folder"
        assert clarification["status"] == "completed"
        assert clarification["message"] == "Which folder would you like to open with VS Code?"
        assert clarification["follow_up"] == {"kind": "system.folder", "application": "vscode"}
        assert "approval" not in clarification
        follow_up = api.post("/api/commands", json={"text": "Open folder Projects in VS Code"}).json()
        assert follow_up["status"] == "approval_required"
        assert follow_up["approval"]["payload"]["path"] == str((root / "Projects").resolve())

def test_outside_hidden_and_tampered_folder_payloads_never_launch(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    hidden = root / ".secret"
    hidden.mkdir()
    launches = []
    monkeypatch.setattr("backend.system._application_executable", lambda app: "/usr/bin/code")
    monkeypatch.setattr("backend.system._launch", lambda command: launches.append(command))

    with api:
        for target in (outside, hidden):
            command = api.post("/api/commands", json={"text": f"Open folder {target} in VS Code"}).json()
            assert command["status"] == "unavailable"
            assert "approval" not in command

        project = root / "safe"
        project.mkdir()
        command = api.post("/api/commands", json={"text": "Open safe in VS Code"}).json()
        approval_id = command["approval"]["id"]
        with api.app.state.store.connection() as connection:
            connection.execute(
                "UPDATE approvals SET payload = ? WHERE id = ?",
                ('{"path": "' + str(outside) + '", "application": "vscode"}', approval_id),
            )
        outcome = api.post(f"/api/approvals/{approval_id}/approve").json()
        assert outcome["command_status"] == "failed"
        assert launches == []


def test_application_catalog_is_fixed_and_rejection_launches_nothing(monkeypatch, tmp_path):
    api, _root = make_client(monkeypatch, tmp_path)
    launches = []
    monkeypatch.setattr("backend.system._application_executable", lambda app: "/usr/bin/code")
    monkeypatch.setattr("backend.system._launch", lambda command: launches.append(command))

    with api:
        command = api.post("/api/commands", json={"text": "Open VS Code"}).json()
        assert command["intent"] == "system.open_application"
        assert command["approval"]["payload"] == {"application": "vscode"}
        outcome = api.post(f"/api/approvals/{command['approval']['id']}/reject").json()
        assert outcome["command_status"] == "rejected"
        assert "no application or folder was opened" in outcome["message"]
        assert launches == []

        arbitrary = api.post("/api/commands", json={"text": "Open arbitrary-binary --danger"}).json()
        assert arbitrary["status"] == "unsupported"
        assert launches == []


def test_system_status_does_not_simulate_screen_awareness(monkeypatch, tmp_path):
    api, root = make_client(monkeypatch, tmp_path)
    with api:
        status = api.get("/api/system/status").json()
        assert status["roots"] == [str(root.resolve())]
        assert status["discovery"]["file_contents_read"] is False
        assert status["screen_awareness"] == {
            "state": "not_configured",
            "capture_active": False,
            "monitors_visible": 0,
            "clicking_enabled": False,
            "detail": "No screen capture, monitor inventory, visual understanding or clicking connector is active.",
        }
