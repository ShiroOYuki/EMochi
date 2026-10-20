import { useEffect, useRef, useState } from "react";
import { libCover, libImageUrl, readFiles, type Character, type LibStyle, type RefRole, type Upload } from "../../api";
import { Section } from "../../components/ui";
import RefPicker, { type TempRef } from "../../components/RefPicker";

// ---------- 0. 新增 ----------

type CreateBody = { request: string; character_id: string | null; character_images: string[] | null; temp_refs: Upload[]; style_lib_id: string | null };

export function NewProject({ nextId, onCreate, focusKey, chars, libs }: { nextId?: string; onCreate: (b: CreateBody) => void; focusKey: number; chars: Character[]; libs: LibStyle[] }) {
  const [text, setText] = useState("");
  const [libId, setLibId] = useState<string | null>(null);   // null = 自己描述
  const lib = libs.find((s) => s.id === libId) ?? null;
  // 角色：預設選第一個（原角色）；undefined = 還沒動過
  const [pick, setPick] = useState<{ id: string | null; images: string[] | null } | undefined>();
  const charSel = pick ?? { id: chars[0]?.id ?? null, images: null };
  const [temp, setTemp] = useState<(TempRef & { data: string })[]>([]);
  const addTemp = async (files: File[]) => {
    const ups = await readFiles(files);
    setTemp((t) => [...t, ...ups.map((u, i) => ({ key: `${Date.now()}_${i}`, url: u.data, data: u.data, name: u.name, role: "character" as RefRole }))]);
  };
  const hasStyleRef = temp.some((t) => t.role === "style");
  const submit = () => onCreate({
    request: text, character_id: charSel.id, character_images: charSel.images,
    temp_refs: temp.map((t) => ({ name: t.name, data: t.data, role: t.role })), style_lib_id: lib?.id ?? null,
  });
  const [flash, setFlash] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // 按「新增貼圖」時：聚焦輸入框並短暫亮起，讓人知道表單在這裡（就算本來就在顯示）
  useEffect(() => {
    if (!focusKey) return;
    box.current?.focus();
    box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [focusKey]);
  const examples = ["黏土公仔風，霧面質感、圓潤立體", "美式卡通粗線條，表情誇張，適合迷因", "貼紙風，角色外圍一圈粗白邊", "水彩繪本風，柔和暈染"];
  return (
    <Section title={`新增貼圖${nextId ? `（將建立 ${nextId}）` : ""}`} step={1}>
      {libs.length > 0 && (
        <div className="mb-4">
          <label className="label">畫風來源</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setLibId(null)} aria-pressed={!lib}
              className={`rounded-full border-2 px-3.5 py-1 text-sm transition ${!lib ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"}`}>✏️ 自己描述</button>
            {libs.map((s) => {
              const on = s.id === libId, cover = libCover(s), ready = !!s.style_block.trim();
              return (
                <button key={s.id} onClick={() => setLibId(s.id)} aria-pressed={on} disabled={!ready} title={ready ? s.notes_zh : "還沒分析，請先到「畫風」分頁讓 Codex 分析"}
                  className={`flex items-center gap-2 rounded-full border-2 py-1 pr-3.5 pl-1 text-sm transition ${on ? "border-pink bg-pink-soft" : "border-line bg-panel hover:border-acc"} disabled:opacity-50`}>
                  {cover ? <img src={libImageUrl(s, cover)} className="checker size-8 rounded-full object-cover" alt="" />
                    : <span className="flex size-8 items-center justify-center rounded-full bg-panel2 text-xs text-mute">?</span>}
                  {s.name || s.id}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {lib ? (
        <div className="rounded-2xl bg-panel2 p-3 text-sm">
          <div className="mb-1">套用畫風庫的「{lib.name || lib.id}」：不用擴寫，直接進入畫風描述（之後仍可修改），勾選的 {lib.images.filter((i) => i.use).length} 張範例圖會當作畫風參考附上。</div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-mute">{lib.style_block}</pre>
        </div>
      ) : <>
      <label className="label">用中文描述想要的畫風，Codex 會把它擴寫成英文畫風描述，再套進固定模板（網格、綠幕、角色特徵）</label>
      <textarea ref={box} className={`input h-28 resize-y transition-shadow ${flash ? "border-pink ring-4 ring-pink/30" : ""}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：像日本動畫截圖的賽璐珞上色，陰影硬邊，眼睛有亮點…" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((e) => <button key={e} className="btn btn-sm" onClick={() => setText(e)}>{e}</button>)}
      </div>
      </>}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="mb-2 text-sm">參考圖</h3>
        <RefPicker characters={chars} characterId={charSel.id} characterImages={charSel.images}
          onCharacter={(id, images) => setPick({ id, images })}
          temp={temp} onAddTemp={addTemp}
          onTempRole={(key, role) => setTemp((t) => t.map((x) => (x.key === key ? { ...x, role } : x)))}
          onRemoveTemp={(key) => setTemp((t) => t.filter((x) => x.key !== key))} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {!lib && !text.trim() && !hasStyleRef && <span className="text-xs text-mute">先寫下想要的畫風、點一個範例、上傳一張「畫風」參考圖，或從畫風庫挑一個</span>}
        <button className="btn btn-primary" disabled={!lib && !text.trim() && !hasStyleRef} onClick={submit}>{lib ? "套用這個畫風" : "交給 Codex 擴寫"}</button>
      </div>
    </Section>
  );
}
