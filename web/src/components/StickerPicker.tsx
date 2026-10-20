import { useState } from "react";
import type { Sticker } from "../api";
import { useStickers } from "../stickers";
import { Check } from "./ui";
import StickerEditor from "./StickerEditor";

/** Gen 挑選步驟：照「表情」分頁的分組列出來勾選；同一個表情在好幾組時，每組都會出現、勾選狀態同步 */
export default function StickerPicker({
  value,
  onChange,
  disabled,
  groupSize = 8,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  groupSize?: number;
}) {
  const { active, groups, ungrouped, byId } = useStickers();
  const sel = new Set(value);
  const sorted = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);
  const toggle = (id: number) =>
    onChange(sel.has(id) ? value.filter((x) => x !== id) : sorted([...value, id]));
  const setMany = (ids: number[], on: boolean) => {
    const next = new Set(value);
    ids.forEach((i) => (on ? next.add(i) : next.delete(i)));
    onChange(sorted(next));
  };
  const [adding, setAdding] = useState(false);

  const sections: { key: string; name: string; items: Sticker[] }[] = [
    ...groups.map((g) => ({
      key: `g${g.id}`,
      name: g.name,
      items: g.ids.map((i) => byId.get(i)).filter((s): s is Sticker => !!s && !s.deleted),
    })),
    ...(ungrouped.length ? [{ key: "none", name: "未分組", items: ungrouped }] : []),
  ].filter((x) => x.items.length);

  return (
    <div className={disabled ? "pointer-events-none opacity-50" : ""}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-sm" onClick={() => onChange(sorted(active.map((s) => s.id)))}>
          全選
        </button>
        <button className="btn btn-sm" onClick={() => onChange([])}>
          清空
        </button>
        <button className="btn btn-sm" onClick={() => setAdding(true)}>
          ＋ 新增表情
        </button>
        <a className="text-xs text-acc hover:underline" href="#/stickers">
          管理表情與分組 →
        </a>
        <span className="ml-auto text-xs text-mute">
          已選 {value.length} 張，會分成 {Math.ceil(value.length / groupSize)} 組生成（每組最多 {groupSize}{" "}
          張）
        </span>
      </div>

      <div className="space-y-3">
        {sections.map(({ key, name, items }) => {
          const all = items.every((s) => sel.has(s.id));
          return (
            <div key={key}>
              <div className="mb-1.5 flex items-center gap-2 text-xs text-mute">
                <span className="text-text">{name}</span>
                <span>{items.length} 張</span>
                <button
                  className="text-acc hover:underline"
                  onClick={() =>
                    setMany(
                      items.map((s) => s.id),
                      !all,
                    )
                  }
                >
                  {all ? "取消此組" : "全選此組"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
                {items.map((s) => (
                  <label
                    key={s.id}
                    title={s.prompt}
                    className={`flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-2 text-xs transition ${sel.has(s.id) ? "border-pink bg-pink-soft" : "border-line bg-panel hover:border-mute"}`}
                  >
                    <Check className="mt-0.5" checked={sel.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                    <span className="min-w-0">
                      <span className="block truncate">
                        #{s.id} {s.label}
                      </span>
                      <span className="block truncate text-mute">{s.zh}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <StickerEditor
        open={adding}
        sticker={null}
        onClose={() => setAdding(false)}
        onSaved={(s) => onChange(sorted([...value, s.id]))}
      />
    </div>
  );
}
