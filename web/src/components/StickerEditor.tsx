import { useEffect, useState } from "react";
import {
  fileUrl,
  invalidate,
  keys,
  readFiles,
  stickersApi,
  type Sticker,
  type StickerBody,
  type Upload,
} from "../api";
import { reloadStickers, useStickers } from "../stickers";
import { Check, DropZone, Modal, Select, Spinner } from "./ui";
import { DeleteButton } from "./DeleteButton";

type Form = {
  label: string;
  zh: string;
  prompt: string;
  prompt_no_ears: string;
  bottom: boolean;
  group: number;
}; // 0＝不放進分組
const EMPTY: Form = { label: "", zh: "", prompt: "", prompt_no_ears: "", bottom: false, group: 0 };

/** 範例圖：saved＝表情已經存的那張；upload＝這次新放的（按儲存才存進表情）；null＝沒有／拿掉了 */
/** 範例圖：saved＝自己放過的；default＝內建表情（#1～32）的預設圖，可以放新的蓋過去；upload＝這次新放的（按儲存才存） */
type Example =
  { kind: "saved" | "default"; url: string } | { kind: "upload"; url: string; upload: Upload } | null;
const defaultExample = (s: Sticker | null): Example =>
  s?.default_example
    ? { kind: "default", url: fileUrl(`sticker_examples_default/${s.default_example}`) }
    : null;
const savedExample = (s: Sticker | null): Example =>
  s?.example
    ? { kind: "saved", url: fileUrl(`sticker_examples/${s.example}`, s.example_v) }
    : defaultExample(s);

/** 新增／編輯表情的對話框（「表情」分頁與 Gen 挑選步驟共用）。
 *  sticker＝null 是新增；onSaved 拿到存好的表情；onDelete 有給才顯示刪除鈕 */
export default function StickerEditor({
  open,
  sticker,
  defaultGroup,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  sticker: Sticker | null;
  defaultGroup?: number | null;
  onClose: () => void;
  onSaved?: (s: Sticker) => void;
  onDelete?: (s: Sticker) => void;
}) {
  const { groups } = useStickers();
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [idea, setIdea] = useState("");
  const [expanding, setExpanding] = useState<"" | "text" | "image">("");
  const [example, setExample] = useState<Example>(null);
  useEffect(() => {
    if (!open) return;
    setErr("");
    setIdea("");
    setExample(savedExample(sticker));
    setF(
      sticker
        ? {
            label: sticker.label,
            zh: sticker.zh,
            prompt: sticker.prompt,
            prompt_no_ears: sticker.prompt_no_ears ?? "",
            bottom: sticker.align === "bottom",
            group: 0,
          }
        : { ...EMPTY, group: defaultGroup ?? 0 },
    );
  }, [open, sticker, defaultGroup]);

  const ok = f.label.trim() && f.prompt.trim();
  /** 讓 Codex 把一句話擴寫成名稱／中文／prompt（短句，跟現有表情同風格）；結果填進表單，存不存由使用者決定 */
  const expand = async (withImage = false) => {
    setExpanding(withImage ? "image" : "text");
    setErr("");
    try {
      const body = { idea, label: f.label, zh: f.zh, prompt: f.prompt };
      const d = withImage
        ? await stickersApi.analyze({ ...body, image: await exampleUpload() })
        : await stickersApi.expand(body);
      // 編輯既有表情時保留原本的英文名稱（使用者通常只想改描述）
      setF((x) => ({
        ...x,
        label: sticker && x.label.trim() ? x.label : d.label,
        zh: d.zh,
        prompt: d.prompt,
        prompt_no_ears: d.prompt_no_ears,
        bottom: d.align === "bottom",
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExpanding("");
    }
  };
  /** 分析要傳的圖：新放的直接用；已存的那張從伺服器讀回來 */
  const exampleUpload = async (): Promise<Upload> => {
    if (example?.kind === "upload") return example.upload;
    const blob = await (await fetch(example!.url)).blob();
    const [u] = await readFiles([new File([blob], "example.png", { type: blob.type || "image/png" })]);
    return u;
  };
  const pickExample = async (files: File[]) => {
    const [u] = await readFiles(files.slice(0, 1));
    if (u) setExample({ kind: "upload", url: u.data, upload: u });
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const body: StickerBody = {
        label: f.label,
        zh: f.zh,
        prompt: f.prompt,
        prompt_no_ears: f.prompt_no_ears,
        align: f.bottom ? "bottom" : null,
      };
      let s = sticker
        ? await stickersApi.update(sticker.id, body)
        : await stickersApi.create({ ...body, group_id: f.group || null });
      if (example?.kind === "upload") s = await stickersApi.setExample(s.id, example.upload);
      else if (example?.kind !== "saved" && sticker?.example) s = await stickersApi.removeExample(s.id);
      await reloadStickers();
      invalidate(keys.stickerThumbs);
      onSaved?.(s);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && !expanding && onClose()}
      label={sticker ? "編輯表情" : "新增表情"}
    >
      <div className="space-y-3">
        <h3 className="text-lg">
          {sticker ? (
            <>
              編輯表情 #{sticker.id}
              <span className="ml-2 text-sm text-mute">檔名 {sticker.name}</span>
            </>
          ) : (
            "新增表情"
          )}
        </h3>
        <div className="flex gap-3 rounded-2xl bg-panel2 p-3">
          {/* 範例圖：表情分析用，也是表情小卡的縮圖 */}
          <div className="w-24 shrink-0">
            {example?.kind === "default" ? (
              // 預設圖：點一下或拖新的圖進來就換掉
              <DropZone
                className="relative size-24 overflow-hidden border-solid p-0"
                onFiles={pickExample}
                disabled={!!expanding}
              >
                <img src={example.url} alt="預設範例圖" className="size-full object-contain" />
                <span className="absolute inset-x-0 bottom-0 bg-panel/85 py-0.5 text-[10px]">
                  預設・點我換
                </span>
              </DropZone>
            ) : example ? (
              <div className="group relative">
                <img src={example.url} alt="範例圖" className="checker size-24 rounded-xl object-contain" />
                <button
                  className="absolute right-1 top-1 hidden rounded-full bg-panel/90 px-1.5 text-xs text-mute hover:text-bad group-hover:block"
                  onClick={() => setExample(defaultExample(sticker))}
                  disabled={!!expanding}
                  aria-label="拿掉範例圖"
                  title={sticker?.default_example ? "拿掉，改回預設範例圖" : "拿掉範例圖"}
                >
                  ×
                </button>
              </div>
            ) : (
              <DropZone className="size-24 p-1" onFiles={pickExample} disabled={!!expanding}>
                <span className="text-lg leading-none">＋</span>
                <span className="text-[11px] leading-tight">範例圖</span>
              </DropZone>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <label className="label">
              用一句話描述想要的表情，或放一張範例圖，讓 Codex 幫你寫（留空就用下面的中文說明）
            </label>
            <div className="flex gap-2">
              <input
                className="input bg-panel"
                autoFocus={!sticker}
                placeholder="例如：捧著茶杯打瞌睡"
                value={idea}
                disabled={!!expanding}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !expanding) expand();
                }}
              />
              <button
                className="btn shrink-0"
                onClick={() => expand()}
                disabled={!!expanding || busy || !(idea.trim() || f.zh.trim() || f.label.trim())}
              >
                {expanding === "text" ? (
                  <>
                    <Spinner className="size-3.5" />
                    擴寫中…
                  </>
                ) : (
                  "✨ 擴寫"
                )}
              </button>
              <button
                className="btn shrink-0"
                onClick={() => expand(true)}
                disabled={!!expanding || busy || !example}
                title={example ? "讓 Codex 看範例圖，填寫名稱、說明與描述" : "先放一張範例圖"}
              >
                {expanding === "image" ? (
                  <>
                    <Spinner className="size-3.5" />
                    分析中…
                  </>
                ) : (
                  "🔍 看圖分析"
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-mute">
              {expanding === "image"
                ? "Codex 看圖中，大約 20～40 秒"
                : expanding
                  ? "Codex 思考中，大約 10～30 秒"
                  : "會參考現有表情的寫法填進下面的欄位，滿意再按儲存。範例圖會跟著表情存起來，當作小卡的縮圖（#1～32 有預設圖）"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">英文名稱{sticker ? "" : "（也會變成檔名）"}</label>
            <input
              className="input"
              placeholder="Sleepy Tea"
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
            />
          </div>
          <div>
            <label className="label">中文說明</label>
            <input
              className="input"
              placeholder="捧著茶杯打瞌睡"
              value={f.zh}
              onChange={(e) => setF({ ...f, zh: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">英文表情描述（會直接放進 prompt）</label>
          <textarea
            className="input h-20 resize-y font-mono text-xs leading-relaxed"
            placeholder="sleepy, holding a cup of tea with both hands, half-closed eyes"
            value={f.prompt}
            onChange={(e) => setF({ ...f, prompt: e.target.value })}
          />
        </div>
        <div>
          <label className="label">沒有獸耳的角色改用這句（選填；描述裡提到耳朵、炸毛時建議填）</label>
          <textarea
            className="input h-16 resize-y font-mono text-xs leading-relaxed"
            placeholder="留空＝沿用上面那句"
            value={f.prompt_no_ears}
            onChange={(e) => setF({ ...f, prompt_no_ears: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-mute">
            <Check checked={f.bottom} onCheckedChange={(v) => setF({ ...f, bottom: v })} />
            輸出時貼齊底邊（像 Lurk 從下方探頭）
          </label>
          {!sticker && groups.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-mute">
              放進分組
              <Select<number>
                className="w-44"
                label="放進分組"
                value={f.group}
                onChange={(v) => setF({ ...f, group: v })}
                options={[
                  { value: 0, label: "不放（未分組）" },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            </div>
          )}
        </div>
        {sticker && (
          <p className="text-[11px] text-mute">已經生成的成品不會變；改過的描述從下一次生成開始使用。</p>
        )}
        {err && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          {sticker && onDelete && <DeleteButton onClick={() => onDelete(sticker)} disabled={busy} />}
          <button className="btn ml-auto" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!ok || busy || !!expanding}>
            {busy ? (
              <>
                <Spinner className="size-3.5 border-on-acc border-t-transparent" />
                儲存中
              </>
            ) : sticker ? (
              "儲存"
            ) : (
              "新增"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
