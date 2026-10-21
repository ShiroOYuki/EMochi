"""API 錯誤：模組丟這些例外，server.py 依類別轉成 HTTP 狀態碼與 {detail}

- NotFound（404）：找不到那一筆
- Invalid（400）：輸入不合法
- Conflict（409）：資料本身沒錯，但目前狀態不允許（執行中、已刪除、還沒預覽…）
- CodexError（502）：呼叫 Codex 失敗
不是這幾種的例外＝程式 bug，回 500 並記 log。

NotFound 同時是 KeyError、Invalid／Conflict 同時是 ValueError，舊的 except／測試照常抓得到。
"""

# 垃圾桶／圖庫種類的中文名稱（錯誤訊息用）
KIND_LABEL = {"projects": "專案", "styles": "畫風", "characters": "角色", "stickers": "表情"}


class AppError(Exception):
    status = 400


class NotFound(AppError, KeyError):
    status = 404

    def __init__(self, what: str):
        super().__init__(what)
        self.what = what

    def __str__(self) -> str:  # KeyError 的 str() 會加引號，這裡改成給人看的句子
        return f"找不到{self.what}"


class Invalid(AppError, ValueError):
    status = 400


class Conflict(AppError, ValueError):
    status = 409


class CodexError(AppError, RuntimeError):
    status = 502
