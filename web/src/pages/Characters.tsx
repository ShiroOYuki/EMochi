import { useCallback, useEffect, useRef, useState } from "react";
import { charactersApi, charImageUrl, projectsApi, type Character, type Upload } from "../api";
import { Section, Spinner } from "../components/ui";
import { DeleteButton, useConfirm } from "../components/manage";
import { LibrarySidebar, PendingUploads, RefImageGrid, useLibrary } from "../components/library";

/** 角色庫：每個角色是一個資料夾（characters/<id>/refs/ + character.json） */
export default function CharactersPage({ active }: { active: boolean }) {
  // 刪除前先查有哪些專案用到這個角色，提醒一下
  const deleteWarn = useCallback(async (c: Character) => {
    const used = await projectsApi
      .list()
      .then((r) => r.projects.filter((p) => p.character_id === c.id).map((p) => p.id))
      .catch(() => [] as string[]);
    return used.length
      ? `${used.join("、")} 用到這個角色；刪除後這些專案重新生成時會找不到角色圖（還原後就恢復）。`
      : undefined;
  }, []);
  const lib = useLibrary<Character>({ api: charactersApi, active, deleteWarn });
  const char = lib.current === null ? null : lib.selected;

  return (
    <div className="flex h-full">
      <LibrarySidebar
        lib={lib}
        noun="角色"
        newLabel="新增角色"
        heading="角色"
        trashKind="characters"
        active={active}
        row={(c) => {
          const cover = c.images.find((i) => i.use)?.file ?? c.images[0]?.file;
          return {
            title: c.name,
            sub: `${c.id}・${c.images.length} 張圖`,
            cover: cover && charImageUrl(c, cover),
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
          {!char ? (
            <NewCharacter
              focusKey={lib.newKey}
              onCreate={(name, images) => lib.act(() => charactersApi.create(name, images))}
            />
          ) : (
            <CharacterView
              key={char.id}
              c={char}
              act={lib.act}
              onRemove={() => lib.askDelete(char, char.name)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NewCharacter({
  onCreate,
  focusKey,
}: {
  onCreate: (name: string, images: Upload[]) => Promise<unknown>;
  focusKey: number;
}) {
  const [name, setName] = useState("");
  const [images, setImages] = useState<Upload[]>([]);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusKey) box.current?.focus();
  }, [focusKey]);
  const submit = async () => {
    setSaving(true);
    try {
      if (await onCreate(name, images)) {
        setName("");
        setImages([]);
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <Section title="新增角色">
      <label className="label">角色名稱</label>
      <input
        ref={box}
        className="input max-w-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例如：黑貓店長"
      />
      <label className="label mt-4">角色參考圖（正面立繪、三視圖、表情都可以，之後也能再加）</label>
      <div className="flex flex-wrap gap-2">
        <PendingUploads images={images} setImages={setImages} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {!name.trim() && <span className="text-xs text-mute">先取個名字</span>}
        <button className="btn btn-primary" disabled={!name.trim() || saving} onClick={submit}>
          {saving ? "建立中…" : "建立角色"}
        </button>
      </div>
    </Section>
  );
}

const EAR_OPTIONS: [boolean | null, string][] = [
  [true, "有"],
  [false, "沒有"],
  [null, "自動判斷"],
];

function CharacterView({
  c,
  act,
  onRemove,
}: {
  c: Character;
  act: (fn: () => Promise<Character>) => Promise<Character | undefined>;
  onRemove: () => void;
}) {
  const [f, setF] = useState({ name: c.name, identity: c.identity });
  useEffect(() => setF({ name: c.name, identity: c.identity }), [c.name, c.identity]);
  const dirty = f.name !== c.name || f.identity !== c.identity;
  const [describing, setDescribing] = useState(false);

  const [confirmDialog, ask] = useConfirm();
  const describe = async () => {
    if (
      dirty &&
      !(await ask({
        title: "讓 Codex 重寫角色特徵？",
        body: "Codex 寫的特徵會蓋掉目前還沒儲存的修改。",
        ok: "繼續",
      }))
    )
      return;
    setDescribing(true);
    try {
      await act(() => charactersApi.describe(c.id));
    } finally {
      setDescribing(false);
    }
  };

  return (
    <>
      <Section title="基本資料" right={<span className="text-xs text-mute">資料夾 characters/{c.id}/</span>}>
        <label className="label">角色名稱</label>
        <input
          className="input max-w-sm"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Section>

      <Section title="參考圖" right={<span className="text-xs text-mute">粉框＝新畫風預設會附上這張</span>}>
        <RefImageGrid
          images={c.images}
          url={(f) => charImageUrl(c, f)}
          api={charactersApi}
          id={c.id}
          act={act}
          toggleTitle="切換是否預設附上"
        />
        <p className="mt-2 text-[11px] text-mute">
          每個角色的檔名都是 ref_01、ref_02…，流水號不會重複使用；滑過檔名可看原檔名。移除的圖會移到
          refs/_removed/，不會真的刪掉。圖片會轉成 PNG、長邊縮到 1536px。
        </p>
      </Section>

      <Section
        title="角色特徵句"
        right={
          <button className="btn btn-sm" disabled={!c.images.length || describing} onClick={describe}>
            {describing ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" />
                Codex 看圖中…
              </span>
            ) : (
              "讓 Codex 看圖寫"
            )}
          </button>
        }
      >
        <label className="label">
          英文，會放進每個 prompt 的「Character
          identity」段落，配合參考圖一起鎖住長相（髮色、耳朵、眼睛、飾品在哪一側…）
        </label>
        <textarea
          className="input h-28 resize-y font-mono text-xs leading-relaxed"
          value={f.identity}
          onChange={(e) => setF({ ...f, identity: e.target.value })}
          placeholder="Character identity to keep: ..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">獸耳</span>
          {EAR_OPTIONS.map(([v, label]) => {
            const on = (c.ears ?? null) === v;
            return (
              <button
                key={label}
                onClick={() => act(() => charactersApi.update(c.id, { ears: v }))}
                aria-pressed={on}
                className={`rounded-full border-2 px-3 py-0.5 text-xs transition ${on ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"}`}
              >
                {label}
              </button>
            );
          })}
          <span className="text-[11px] text-mute">
            沒有獸耳時，表情裡「耳朵豎起、炸毛」之類的描述會換成不提耳朵的版本
          </span>
        </div>
        {c.notes_zh && <p className="mt-2 text-xs text-mute">💡 {c.notes_zh}</p>}
        {describing && <p className="mt-2 text-xs text-mute">大約 30 秒～1 分鐘，可以先去別的分頁。</p>}
      </Section>

      <div className="flex items-center gap-3">
        <DeleteButton onClick={onRemove} title="移到垃圾桶" />
        {confirmDialog}
        <button
          className="btn btn-primary ml-auto"
          disabled={!dirty || !f.name.trim()}
          onClick={() => act(() => charactersApi.update(c.id, f))}
        >
          儲存修改
        </button>
      </div>
    </>
  );
}
