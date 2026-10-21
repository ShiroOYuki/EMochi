"""專案狀態 enum：存進 JSON 要是原本的字串；require_status 的錯誤訊息"""

import json

import pytest

from app.project_types import BUSY, EDITABLE, ItemStatus, Status, require_status


def test_status_is_plain_string_in_json():
    assert json.dumps({"status": Status.PREVIEW_READY, "g": ItemStatus.FAILED}) == (
        '{"status": "preview_ready", "g": "failed"}'
    )
    assert Status("draft") is Status.DRAFT
    assert "draft" in EDITABLE  # 從 JSON 讀回來的是一般字串，也要比得到


def test_busy_and_editable_do_not_overlap():
    assert not BUSY & EDITABLE
    assert Status.DONE not in BUSY | EDITABLE


def test_require_status():
    require_status({"status": "draft"}, EDITABLE, "預覽")
    with pytest.raises(ValueError, match="目前狀態 generating 不能預覽"):
        require_status({"status": "generating"}, EDITABLE, "預覽")
