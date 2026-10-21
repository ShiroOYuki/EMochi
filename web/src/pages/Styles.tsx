import { useRef, useState } from "react";
import {
  fileUrl,
  invalidate,
  keys,
  libCover,
  libImageUrl,
  styleLibApi,
  useImportable,
  type LibStyle,
  type NewLibStyleBody,
  type Upload,
} from "../api";
import { Section, Select, Spinner } from "../components/ui";
import { DeleteButton } from "../components/DeleteButton";
import { useConfirm } from "../components/confirm";
import { LibrarySidebar, PendingUploads, RefImageGrid, useLibrary } from "../components/library";
import { useEffectOnBump, useOnChange } from "../hooks/useOnChange";

/** 畫風庫：上傳範例貼圖 → Codex 分析畫風 → 存起來，Gen 新增畫風時可以直接套用 */
export default function StylesPage() {
  const lib = useLibrary<LibStyle>({ api: styleLibApi, tab: "styles" });
  const style = lib.current === null ? null : lib.selected;

  return (
    <div className="flex h-full">
      <LibrarySidebar
        lib={lib}
        noun="畫風"
        newLabel="新增畫風"
        heading="畫風庫"
        trashKind="styles"
        empty="還沒有畫風。上傳範例貼圖讓 Codex 分析，或從現有的畫風專案匯入。"
        row={(s) => {
          const cover = libCover(s);
          return {
            title: s.name || "（未命名）",
            cover: cover && libImageUrl(s, cover),
            sub: (
              <>
                {s.id}
                {s.source_project ? `・來自 ${s.source_project}` : ""}
                {!s.style_block && "・待分析"}
              </>
            ),
          };
        }}
      />

      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-4xl space-y-4">
          {lib.err && (
            <div className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">
              {lib.err}
            </div>
          )}
          {!style ? (
            <>
              <NewStyle focusKey={lib.newKey} onCreate={(body) => lib.act(() => styleLibApi.create(body))} />
              <ImportSection
                enabled={lib.current === null}
                onImport={async (project) => {
                  const s = await lib.act(() => styleLibApi.importProject(project));
                  invalidate(keys.importable); // 匯入過的會標成「已匯入」
                  return s;
                }}
              />
            </>
          ) : (
            <StyleView
              key={style.id}
              s={style}
              act={lib.act}
              onRemove={() => lib.askDelete(style, style.name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NewStyle({
  onCreate,
  focusKey,
}: {
  onCreate: (b: NewLibStyleBody) => Promise<LibStyle | undefined>;
  focusKey: number;
}) {
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [images, setImages] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const drop = useRef<HTMLDivElement>(null);
  useEffectOnBump(focusKey, () => drop.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  const submit = async (analyze: boolean) => {
    setBusy(analyze);
    try {
      if (await onCreate({ name, request, images, analyze })) {
        setName("");
        setRequest("");
        setImages([]);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="從範例貼圖分析畫風">
      <p className="mb-3 text-sm text-mute">
        放幾張想模仿的貼圖（同一種畫風，1～4 張最好），Codex
        只看「畫法」——線條、上色、比例、表情怎麼畫——不管圖裡畫的是誰。
      </p>
      <div ref={drop} className="flex flex-wrap gap-2">
        <PendingUploads images={images} setImages={setImages} disabled={busy} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
        <div>
          <label className="label">畫風名稱（可空，Codex 會取）</label>
          <input
            className="input"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：黏土公仔"
          />
        </div>
        <div>
          <label className="label">補充說明（可空；和圖不一致時以文字為準）</label>
          <input
            className="input"
            value={request}
            disabled={busy}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="例如：線條再粗一點、不要漸層"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-mute">
            <Spinner className="size-3" />
            Codex 看圖中，大約 30 秒～1 分鐘…
          </span>
        )}
        {!images.length && <span className="text-xs text-mute">先放至少一張範例貼圖</span>}
        <button
          className="btn"
          disabled={!images.length || busy}
          onClick={() => submit(false)}
          title="先存起來，之後再分析"
        >
          只建立
        </button>
        <button className="btn btn-primary" disabled={!images.length || busy} onClick={() => submit(true)}>
          建立並分析
        </button>
      </div>
    </Section>
  );
}

function ImportSection({
  enabled,
  onImport,
}: {
  enabled: boolean;
  onImport: (project: string) => Promise<LibStyle | undefined>;
}) {
  const { data: items = [] } = useImportable(enabled);
  if (!items.length) return null;
  return (
    <Section title="從現有的畫風專案匯入">
      <p className="mb-3 text-sm text-mute">
        把 s1、s2… 的畫風描述存進畫風庫，範例圖用該專案自己生出來的網格圖。
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((o) => (
          <div key={o.id} className="rounded-2xl border border-line bg-panel p-2">
            {o.image ? (
              <img
                src={fileUrl(o.image)}
                className="aspect-square w-full rounded-xl bg-panel2 object-contain"
                alt=""
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-panel2 text-xs text-mute">
                沒有圖
              </div>
            )}
            <div className="mt-1.5 truncate text-sm">
              {o.id}
              <span className="ml-1.5 text-xs text-mute">{o.name}</span>
            </div>
            {o.needs_analyze && <div className="text-[11px] text-mute">沒有文字描述，匯入後再分析</div>}
            <button className="btn btn-sm mt-1.5 w-full" onClick={() => onImport(o.id)}>
              {o.imported ? "再匯入一份" : "匯入"}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StyleView({
  s,
  act,
  onRemove,
}: {
  s: LibStyle;
  act: (fn: () => Promise<LibStyle>) => Promise<LibStyle | undefined>;
  onRemove: () => void;
}) {
  const pick = (x: LibStyle) => ({
    name: x.name,
    request: x.request,
    framing: x.framing,
    style_block: x.style_block,
    square: x.process.square,
    margin: x.process.margin,
  });
  const [f, setF] = useState(pick(s));
  useOnChange(s.updated, () => setF(pick(s))); // 存檔或分析完才重設；切回分頁不會蓋掉還沒存的修改
  const orig = pick(s);
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== orig[k]);
  const [analyzing, setAnalyzing] = useState(false);
  const body = () => ({
    name: f.name,
    request: f.request,
    framing: f.framing,
    style_block: f.style_block,
    process: { square: f.square, margin: f.margin },
  });
  const setFraming = (framing: "closeup" | "whole") =>
    setF({
      ...f,
      framing,
      square: framing === "closeup" ? 0.5 : null,
      margin: framing === "closeup" ? 0 : 0.04,
    });
  const [confirmDialog, ask] = useConfirm();
  const analyze = async () => {
    if (
      s.style_block &&
      !(await ask({
        title: "讓 Codex 重新分析畫風？",
        body: "Codex 寫的描述會蓋掉目前的畫風描述。",
        ok: "重新分析",
      }))
    )
      return;
    setAnalyzing(true);
    try {
      await act(() => styleLibApi.analyze(s.id, f.request));
    } finally {
      setAnalyzing(false);
    }
  };
  const used = s.images.filter((i) => i.use).length;

  return (
    <>
      <Section title="範例貼圖" right={<span className="text-xs text-mute">粉框＝分析與套用時會附上</span>}>
        <RefImageGrid
          images={s.images}
          url={(f) => libImageUrl(s, f)}
          api={styleLibApi}
          id={s.id}
          act={act}
          toggleTitle="切換是否附上"
        />
      </Section>

      <Section
        title="畫風描述"
        right={
          <button className="btn btn-sm" disabled={!used || analyzing} onClick={analyze}>
            {analyzing ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" />
                Codex 看圖中…
              </span>
            ) : s.style_block ? (
              "重新分析"
            ) : (
              "讓 Codex 分析"
            )}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_200px]">
          <div>
            <label className="label">畫風名稱</label>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label className="label">補充說明（分析時一起給 Codex）</label>
            <input
              className="input"
              value={f.request}
              onChange={(e) => setF({ ...f, request: e.target.value })}
            />
          </div>
          <div>
            <label className="label">構圖</label>
            <Select<"closeup" | "whole">
              label="構圖"
              value={f.framing}
              onChange={setFraming}
              options={[
                { value: "closeup", label: "特寫（臉塞滿、邊緣裁切）" },
                { value: "whole", label: "整顆入鏡（如麻糬）" },
              ]}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">英文畫風描述（會放進 prompt 的 Art style 段落）</label>
          <textarea
            className="input h-48 resize-y font-mono text-xs leading-relaxed"
            value={f.style_block}
            onChange={(e) => setF({ ...f, style_block: e.target.value })}
            placeholder={used ? "按右上角「讓 Codex 分析」，或自己寫" : "先勾選至少一張範例貼圖"}
          />
        </div>
        {s.notes_zh && <p className="mt-2 text-xs text-mute">💡 {s.notes_zh}</p>}
        {analyzing && <p className="mt-2 text-xs text-mute">大約 30 秒～1 分鐘，可以先去別的分頁。</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-mute">
          <span>
            後處理：{f.square === null ? "不裁切" : `裁成正方形（上方比例 ${f.square}）`}、留白 {f.margin}
          </span>
          <span>
            ・{s.id}
            {s.source_project ? `，匯入自 ${s.source_project}` : ""}
          </span>
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <DeleteButton onClick={onRemove} title="移到垃圾桶" />
        {confirmDialog}
        <span className="ml-auto text-xs text-mute">
          {s.style_block ? "到「生成」分頁新增貼圖時就能選這個畫風" : "分析完才能在「生成」使用"}
        </span>
        <button
          className="btn btn-primary"
          disabled={!dirty}
          onClick={() => act(() => styleLibApi.update(s.id, body()))}
        >
          儲存修改
        </button>
      </div>
    </>
  );
}
