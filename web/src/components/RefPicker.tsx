import { charImageUrl, charUsed, type Character, type RefRole } from "../api";
import { DropZone } from "./ui";

/** 暫時參考圖（還沒存＝data URL；已存＝檔案網址） */
export type TempRef = { key: string; url: string; name: string; role: RefRole };

type Props = {
  characters: Character[];
  characterId: string | null;
  characterImages: string[] | null;          // null = 用角色預設勾選的圖
  onCharacter: (id: string | null, images: string[] | null) => void;
  temp: TempRef[];
  onAddTemp: (files: File[]) => void;
  onTempRole: (key: string, role: RefRole) => void;
  onRemoveTemp: (key: string) => void;
  disabled?: boolean;
};

const ROLE_TEXT: Record<RefRole, string> = { character: "角色", style: "畫風" };

/** 選角色（快速切換）＋決定附哪幾張＋這次專用的暫時參考圖 */
export default function RefPicker(props: Props) {
  const { characters, characterId, characterImages, onCharacter, temp, disabled } = props;
  const char = characters.find((c) => c.id === characterId) ?? null;
  const used = char ? charUsed(char, characterImages) : [];
  const toggleImage = (file: string) => {
    const next = used.includes(file) ? used.filter((f) => f !== file) : [...used, file];
    onCharacter(characterId, next);
  };
  const hasCharacterRef = used.length > 0 || temp.some((t) => t.role === "character");

  return (
    <div className="space-y-3">
      <div>
        <div className="label flex items-center">
          <span>角色</span>
          <a href="#/characters" className="ml-auto text-acc hover:underline">管理角色</a>
        </div>
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => {
            const cover = charUsed(c, null)[0] ?? c.images[0]?.file;
            const on = c.id === characterId;
            return (
              <button key={c.id} disabled={disabled} onClick={() => onCharacter(c.id, null)} aria-pressed={on}
                className={`flex items-center gap-2 rounded-full border-2 py-1 pr-3.5 pl-1 text-sm transition ${on ? "border-pink bg-pink-soft" : "border-line bg-panel hover:border-acc"} disabled:opacity-60`}>
                {cover
                  ? <img src={charImageUrl(c, cover)} className="checker size-8 rounded-full object-cover" alt="" />
                  : <span className="flex size-8 items-center justify-center rounded-full bg-panel2 text-xs text-mute">?</span>}
                {c.name}
              </button>
            );
          })}
          <button disabled={disabled} onClick={() => onCharacter(null, null)} aria-pressed={!characterId}
            className={`rounded-full border-2 px-3.5 py-1 text-sm transition ${!characterId ? "border-pink bg-pink-soft" : "border-line text-mute hover:border-acc"} disabled:opacity-60`}>
            不指定
          </button>
        </div>
      </div>

      {char && (
        <div>
          <div className="label">附給 Codex 的角色圖（點圖切換，粉框＝這次會附上）</div>
          {char.images.length === 0
            ? <p className="text-xs text-mute">這個角色還沒有圖，到「角色」分頁上傳。</p>
            : <div className="flex flex-wrap gap-2">
                {char.images.map((i) => {
                  const on = used.includes(i.file);
                  return (
                    <button key={i.file} disabled={disabled} onClick={() => toggleImage(i.file)} title={i.source ? `${i.file}（原檔名 ${i.source}）` : i.file} aria-label={i.file} aria-pressed={on}
                      className={`checker size-20 overflow-hidden rounded-xl border-[3px] transition ${on ? "border-pink" : "border-transparent opacity-40 hover:opacity-80"}`}>
                      <img src={charImageUrl(char, i.file)} className="size-full object-contain" alt={i.file} />
                    </button>
                  );
                })}
              </div>}
          {char.identity && <p className="mt-2 line-clamp-2 text-xs text-mute" title={char.identity}>特徵句：{char.identity}</p>}
        </div>
      )}

      <div>
        <div className="label">暫時參考圖（只用在這個畫風，不會存進角色庫）</div>
        <div className="flex flex-wrap items-stretch gap-2">
          {temp.map((t) => (
            <div key={t.key} className="w-28 rounded-xl border border-line bg-panel2 p-1.5">
              <div className="checker relative aspect-square overflow-hidden rounded-lg">
                <img src={t.url} className="size-full object-contain" alt={t.name} />
                <button disabled={disabled} onClick={() => props.onRemoveTemp(t.key)} aria-label={`移除 ${t.name}`}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-panel/90 text-xs shadow hover:text-bad disabled:hidden">✕</button>
              </div>
              <div className="mt-1.5 flex rounded-full bg-panel p-0.5 text-[11px]">
                {(["character", "style"] as RefRole[]).map((r) => (
                  <button key={r} disabled={disabled} onClick={() => props.onTempRole(t.key, r)}
                    className={`flex-1 rounded-full py-0.5 transition ${t.role === r ? (r === "style" ? "bg-gold text-on-gold" : "bg-pink text-[#3d0f22]") : "text-mute"}`}>
                    {ROLE_TEXT[r]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <DropZone onFiles={props.onAddTemp} disabled={disabled} className="min-h-28 w-40" />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mute">
          「角色」＝照這張的長相畫；「畫風」＝只學它的畫法，不抄裡面的角色（擴寫時也會給 Codex 看）。
        </p>
      </div>

      {!hasCharacterRef && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">沒有任何角色參考圖，Codex 會自己決定角色長相。</p>
      )}
    </div>
  );
}
