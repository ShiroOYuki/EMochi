"""把後端的 OpenAPI 規格寫到 web/openapi.json，給 openapi-typescript 產生前端型別

用法（在專案根目錄）：cd web && npm run gen:api
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.server import app  # noqa: E402

out = Path(__file__).resolve().parent.parent / "web" / "openapi.json"
out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out}")
