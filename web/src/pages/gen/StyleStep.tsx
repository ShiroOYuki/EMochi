import { useEffect, useState } from "react";
import { fileUrl, projectsApi, readFiles, type Character, type Project } from "../../api";
import { Modal, Section, Select, Spinner } from "../../components/ui";
import RefPicker, { type TempRef } from "../../components/RefPicker";
import { type ViewProps } from "./shared";

// ---------- 1. 畫風描述 ----------

export function StyleStep({ p, act, chars }: { p: Project; act: ViewProps["act"]; chars: Character[] }) {
  const editable = ["draft", "preview_ready"].includes(p.status);
  const [f, setF] = useState({
    request: p.request,
    name: p.name,
    framing: p.framing,
    style_block: p.style_block,
    square: p.process.square,
    margin: p.process.margin,
  });
  // 伺服器端內容變了（例如擴寫完成）就同步到表單
  useEffect(() => {
    setF({
      request: p.request,
      name: p.name,
      framing: p.framing,
      style_block: p.style_block,
      square: p.process.square,
      margin: p.process.margin,
    });
  }, [p.request, p.name, p.framing, p.style_block, p.process.square, p.process.margin]);
  const dirty =
    f.name !== p.name ||
    f.framing !== p.framing ||
    f.style_block !== p.style_block ||
    f.square !== p.process.square ||
    f.margin !== p.process.margin;

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const body = () => ({
    name: f.name,
    framing: f.framing,
    style_block: f.style_block,
    process: { square: f.square, margin: f.margin },
  });
  const save = () => act(() => projectsApi.update(p.id, body()));
  const openPrompt = async () => {
    if (dirty) await save();
    setPromptText(await projectsApi.prompt(p.id));
    setShowPrompt(true);
  };
  const setFraming = (framing: "closeup" | "whole") =>
    setF({
      ...f,
      framing,
      square: framing === "closeup" ? 0.5 : null,
      margin: framing === "closeup" ? 0 : 0.04,
    });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState("");
  useEffect(() => {
    setSaved(null);
    setSaveErr("");
  }, [p.id, p.style_block]);
  const toLibrary = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      setSaved((await projectsApi.toLibrary(p.id)).id);
    } catch (e) {
      setSaveErr(`存到畫風庫失敗：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (p.status === "expanding") {
    return (
      <Section title="描述畫風" step={1}>
        <div className="flex items-center gap-2 text-mute">
          <Spinner />
          Codex 正在把「{p.request}」擴寫成畫風描述，大約 30 秒～1 分鐘…
        </div>
      </Section>
    );
  }
  return (
    <Section
      title="描述畫風"
      step={1}
      dim={!editable && p.status !== "previewing"}
      right={
        <button className="btn btn-sm" onClick={openPrompt} disabled={!p.style_block}>
          查看完整 prompt
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
        <div>
          <label className="label">你的需求</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={f.request}
              disabled={!editable}
              onChange={(e) => setF({ ...f, request: e.target.value })}
            />
            <button
              className="btn shrink-0"
              disabled={!editable || (!f.request.trim() && !p.ref_paths?.style.length)}
              title="用新的需求（和畫風參考圖）讓 Codex 重寫畫風描述"
              onClick={() => act(() => projectsApi.expand(p.id, f.request))}
            >
              重新擴寫
            </button>
          </div>
        </div>
        <div>
          <label className="label">畫風名稱</label>
          <input
            className="input"
            value={f.name}
            disabled={!editable}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label">構圖</label>
          <Select<"closeup" | "whole">
            label="構圖"
            value={f.framing}
            disabled={!editable}
            onChange={setFraming}
            options={[
              { value: "closeup", label: "特寫（臉塞滿、邊緣裁切）" },
              { value: "whole", label: "整顆入鏡（如麻糬）" },
            ]}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">畫風描述（英文，會放進 prompt 的 Art style 段落；可以直接修改）</label>
        <textarea
          className="input h-44 resize-y font-mono text-xs leading-relaxed"
          value={f.style_block}
          disabled={!editable}
          onChange={(e) => setF({ ...f, style_block: e.target.value })}
        />
      </div>
      {p.notes_zh && <p className="mt-2 text-xs text-mute">💡 {p.notes_zh}</p>}
      <ProjectRefs p={p} act={act} chars={chars} editable={editable} />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mute">
        <span>
          後處理：{f.square === null ? "不裁切" : `裁成正方形（上方比例 ${f.square}）`}、留白 {f.margin}
        </span>
        {p.style_lib_id && <span>・套用自畫風庫 {p.style_lib_id}</span>}
        {saveErr && <span className="text-bad">{saveErr}</span>}
        <div className="ml-auto flex gap-2">
          <button
            className="btn"
            disabled={!p.style_block || dirty || saving}
            onClick={toLibrary}
            title={dirty ? "先儲存修改" : "把目前的畫風描述和範例圖（預覽圖＋畫風參考圖）存成畫風庫的一筆"}
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" />
                存入中…
              </span>
            ) : saved ? (
              `已存成 ${saved} ✓`
            ) : (
              "存到畫風庫"
            )}
          </button>
          <button className="btn" disabled={!editable || !dirty} onClick={save}>
            儲存修改
          </button>
          <button
            className="btn btn-primary"
            disabled={!editable || !f.style_block.trim()}
            onClick={async () => {
              if (dirty) await save();
              await act(() => projectsApi.preview(p.id));
            }}
          >
            {p.preview ? "用目前描述重新產生預覽" : "確認，產生風格預覽圖"}
          </button>
        </div>
      </div>
      <Modal open={showPrompt} onClose={() => setShowPrompt(false)}>
        <div className="mb-2 flex items-center">
          <h3>預覽圖的完整 prompt</h3>
          <button className="btn btn-sm ml-auto" onClick={() => navigator.clipboard.writeText(promptText)}>
            複製
          </button>
        </div>
        <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-lg bg-panel2 p-3 text-xs leading-relaxed">
          {promptText}
        </pre>
      </Modal>
    </Section>
  );
}

// 已建立專案的參考圖：每個動作直接存到伺服器
function ProjectRefs({
  p,
  act,
  chars,
  editable,
}: {
  p: Project;
  act: ViewProps["act"];
  chars: Character[];
  editable: boolean;
}) {
  const refs = p.refs ?? { character_id: null, character_images: null, temp: [] };
  const paths = p.ref_paths ?? { character: [], style: [], identity: "", ears: true };
  const temp: TempRef[] = refs.temp.map((t) => ({
    key: t.file,
    name: t.file,
    role: t.role,
    url: fileUrl(`outputs/${p.id}/refs/${t.file}`),
  }));
  const [open, setOpen] = useState(false);
  const n = paths.character.length + paths.style.length;
  const charName = chars.find((c) => c.id === refs.character_id)?.name;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel2/60 p-3">
      <button
        className="flex w-full items-center gap-2 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>參考圖</span>
        <span className="text-xs text-mute">
          {charName ? `角色：${charName}` : "未指定角色"}・附 {n} 張
          {paths.style.length ? `（含畫風參考 ${paths.style.length} 張）` : ""}
        </span>
        <span className="ml-auto text-xs text-acc">{open ? "收起" : editable ? "調整" : "查看"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <RefPicker
            characters={chars}
            characterId={refs.character_id}
            characterImages={refs.character_images}
            disabled={!editable}
            onCharacter={(id, images) =>
              act(() =>
                projectsApi.update(p.id, {
                  character_id: id,
                  character_images: id === refs.character_id ? images : null,
                }),
              )
            }
            temp={temp}
            onAddTemp={async (files) => {
              const ups = await readFiles(files, "character");
              if (ups.length) await act(() => projectsApi.addRefs(p.id, ups));
            }}
            onTempRole={(file, role) => act(() => projectsApi.setRefRole(p.id, file, role))}
            onRemoveTemp={(file) => act(() => projectsApi.removeRef(p.id, file))}
          />
          {editable && p.preview && (
            <p className="mt-2 text-xs text-mute">改了參考圖之後，記得按「重新產生預覽」才會套用到樣張。</p>
          )}
          {!editable && <p className="mt-2 text-xs text-mute">生成中或已完成時不能改參考圖。</p>}
        </div>
      )}
    </div>
  );
}
