#!/usr/bin/env python3
"""
貼圖預覽 / 勾選匯出 / 組合工具
用法：uv run tools/viewer.py   （或雙擊 scripts\viewer.bat）→ 自動開啟 http://127.0.0.1:8765
依賴：Pillow
"""
import io, json, re, sys, time, zipfile, webbrowser, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
EXPORTS = ROOT / "exports"
PORT = 8765

FORMATS = {  # key: (label, relative folder under final/)
    "master": ("Master 512", "master"),
    "t112": ("Twitch 112", "twitch/112"),
    "t56": ("Twitch 56", "twitch/56"),
    "t28": ("Twitch 28", "twitch/28"),
    "discord": ("Discord 128", "discord"),
}


def load_meta():
    p = ROOT / "config" / "stickers.json"
    try:
        return {m["id"]: m for m in json.loads(p.read_text(encoding="utf-8"))}
    except Exception:
        return {}


def scan():
    """找出 outputs 底下所有含 master/ 的 final 資料夾，每個當作一種畫風"""
    meta = load_meta()
    styles = []
    for master in sorted(OUT.glob("**/final/master")):
        final = master.parent
        rel = final.relative_to(OUT).as_posix()          # final 或 s2/final
        sid = "s1" if rel == "final" else rel.split("/")[0]
        items = []
        for f in sorted(master.glob("*.png")):
            m = re.match(r"(\d+)_(.+)\.png$", f.name)
            if not m:
                continue
            num, name = int(m.group(1)), m.group(2)
            files = {}
            for k, (_, sub) in FORMATS.items():
                fn = f"{name}.png" if k == "discord" else f.name
                if (final / sub / fn).exists():
                    files[k] = f"{rel}/{sub}/{fn}"
            info = meta.get(num, {})
            items.append({"id": num, "name": name, "label": info.get("label", name),
                          "zh": info.get("zh", ""), "group": info.get("group", (num - 1) // 8 + 1),
                          "files": files})
        styles.append({"id": sid, "path": rel, "items": items})
    styles.sort(key=lambda s: s["id"])
    return styles


def find(styles, key):
    sid, num = key.split(":")
    for s in styles:
        if s["id"] == sid:
            for it in s["items"]:
                if it["id"] == int(num):
                    return s, it
    return None, None


def stamp():
    return time.strftime("%Y%m%d_%H%M%S")


def clean_tag(tag):
    return re.sub(r"[^A-Za-z0-9_-]", "", (tag or "").strip())[:20]


def suffixed(fname, style, tag):
    """01_happy.png -> 01_happy_s1.png / 01_happy_s1_v1.png"""
    stem, ext = fname.rsplit(".", 1)
    return f"{stem}_{style}{'_' + tag if tag else ''}.{ext}"


def do_export(keys, fmts, tag=""):
    tag = clean_tag(tag)
    styles = scan()
    buf = io.BytesIO()
    n = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for key in keys:
            s, it = find(styles, key)
            if not it:
                continue
            for k in fmts:
                if k in it["files"]:
                    src = OUT / it["files"][k]
                    z.write(src, f"{s['id']}/{FORMATS[k][1]}/{suffixed(src.name, s['id'], tag)}")
                    n += 1
    EXPORTS.mkdir(exist_ok=True)
    st = stamp()
    name = f"export_{st}{'_' + tag if tag else ''}.zip"
    (EXPORTS / name).write_bytes(buf.getvalue())
    write_json(f"export_{st}.json", selection_doc(keys, kind="export", formats=list(fmts), zip=name, version=tag or None))
    return name, buf.getvalue(), n


def selection_doc(keys, **extra):
    """勾選清單 JSON：keys 用來還原勾選，items 方便人工閱讀"""
    styles = scan()
    items = []
    for k in keys:
        s, it = find(styles, k)
        if it:
            items.append({"key": k, "style": s["id"], "id": it["id"], "name": it["name"]})
    doc = {"version": 1, "created": time.strftime("%Y-%m-%d %H:%M:%S"),
           "keys": [i["key"] for i in items], "items": items}
    doc.update({k: v for k, v in extra.items() if v is not None})
    return doc


def write_json(name, doc):
    EXPORTS.mkdir(exist_ok=True)
    (EXPORTS / name).write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return name


def list_selections():
    if not EXPORTS.exists():
        return []
    files = sorted(EXPORTS.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for f in files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            out.append({"file": f.name, "count": len(d.get("keys", [])), "created": d.get("created", ""),
                        "kind": d.get("kind", "")})
        except Exception:
            pass
    return out


def get_font(px):
    for f in ["arial.ttf", "C:/Windows/Fonts/arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        try:
            return ImageFont.truetype(f, px)
        except Exception:
            pass
    return ImageFont.load_default()


def do_combine(keys, cols, cell, gap, bg, labels):
    orig_keys = list(keys)
    styles = scan()
    imgs = []
    keys = sorted(keys, key=lambda k: (int(k.split(":")[1]), k.split(":")[0]))
    for key in keys:
        s, it = find(styles, key)
        if it and "master" in it["files"]:
            im = Image.open(OUT / it["files"]["master"]).convert("RGBA").resize((cell, cell), Image.LANCZOS)
            imgs.append((im, f"{s['id']} {it['label']}"))
    if not imgs:
        raise ValueError("沒有可組合的貼圖")
    cols = max(1, min(cols, len(imgs)))
    rows = (len(imgs) + cols - 1) // cols
    lab_h = max(14, cell // 7) if labels else 0
    W = cols * cell + (cols + 1) * gap
    H = rows * (cell + lab_h) + (rows + 1) * gap
    bgc = {"transparent": (0, 0, 0, 0), "dark": (49, 51, 56, 255), "light": (255, 255, 255, 255)}[bg]
    sheet = Image.new("RGBA", (W, H), bgc)
    d = ImageDraw.Draw(sheet)
    font = get_font(max(10, lab_h - 4))
    txt = (230, 230, 230, 255) if bg == "dark" else (40, 40, 40, 255)
    for i, (im, lab) in enumerate(imgs):
        r, c = divmod(i, cols)
        x = gap + c * (cell + gap)
        y = gap + r * (cell + lab_h + gap)
        sheet.alpha_composite(im, (x, y))
        if labels:
            tw = d.textlength(lab, font=font)
            d.text((x + (cell - tw) / 2, y + cell + 1), lab, fill=txt, font=font)
    out = io.BytesIO()
    sheet.save(out, "PNG", optimize=True)
    EXPORTS.mkdir(exist_ok=True)
    st = stamp()
    name = f"sheet_{st}.png"
    (EXPORTS / name).write_bytes(out.getvalue())
    write_json(f"sheet_{st}.json", selection_doc(orig_keys, kind="combine", sheet=name,
               combine={"cols": cols, "cell": cell, "gap": gap, "bg": bg, "labels": labels}))
    return name, out.getvalue()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/":
            return self.send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        if u.path == "/api/styles":
            return self.send(200, json.dumps(scan()).encode(), "application/json")
        if u.path == "/api/selections":
            return self.send(200, json.dumps(list_selections(), ensure_ascii=False).encode(), "application/json")
        if u.path.startswith("/img/"):
            p = (OUT / unquote(u.path[5:])).resolve()
            if OUT.resolve() in p.parents and p.suffix == ".png" and p.exists():
                return self.send(200, p.read_bytes(), "image/png")
        if u.path.startswith("/exports/"):
            p = (EXPORTS / unquote(u.path[9:])).resolve()
            if EXPORTS.resolve() in p.parents and p.exists():
                ct = {".png": "image/png", ".json": "application/json; charset=utf-8"}.get(p.suffix, "application/zip")
                return self.send(200, p.read_bytes(), ct,
                                 {"Content-Disposition": f'attachment; filename="{p.name}"'} if p.suffix == ".zip" else None)
        self.send(404, b"not found", "text/plain")

    def do_POST(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            keys = data.get("keys", [])
            if self.path == "/api/export":
                name, _, n = do_export(keys, data.get("formats", []), data.get("version", ""))
                return self.send(200, json.dumps({"file": name, "count": n}).encode(), "application/json")
            if self.path == "/api/selection":
                doc = selection_doc(keys, kind="selection", note=data.get("note") or None,
                                    formats=data.get("formats"), combine=data.get("combine"),
                                    version=clean_tag(data.get("version")) or None)
                name = write_json(f"selection_{stamp()}.json", doc)
                return self.send(200, json.dumps({"file": name, "count": len(doc["keys"])}).encode(), "application/json")
            if self.path == "/api/combine":
                name, _ = do_combine(keys, int(data.get("cols", 8)), int(data.get("cell", 128)),
                                     int(data.get("gap", 8)), data.get("bg", "transparent"),
                                     bool(data.get("labels", False)))
                return self.send(200, json.dumps({"file": name}).encode(), "application/json")
            self.send(404, b"not found", "text/plain")
        except Exception as e:
            self.send(400, json.dumps({"error": str(e)}).encode(), "application/json")


PAGE = r"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>貼圖預覽</title>
<style>
:root{--bg:#1e1f22;--panel:#2b2d31;--line:#3a3c42;--text:#e6e6e6;--mute:#9a9ca3;--acc:#7aa2ff;--sel:#5865f2}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 system-ui,"Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--text)}
header{position:sticky;top:0;z-index:5;background:var(--panel);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
h1{font-size:16px;margin:0 12px 0 0}
button,select,input{font:inherit;color:var(--text);background:#383a40;border:1px solid var(--line);border-radius:6px;padding:5px 10px}
button{cursor:pointer}button:hover{border-color:var(--acc)}button.on{background:var(--sel);border-color:var(--sel)}
.sp{flex:1}.count{color:var(--mute)}
main{display:grid;grid-template-columns:1fr 300px;gap:16px;padding:16px}
@media(max-width:900px){main{grid-template-columns:1fr}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;align-content:start}
.card{position:relative;background:var(--panel);border:2px solid transparent;border-radius:10px;padding:8px;cursor:pointer;text-align:center}
.card:hover{border-color:var(--line)}.card.sel{border-color:var(--sel)}
.card img{width:112px;height:112px;display:block;margin:0 auto 4px;image-rendering:auto}
.card .nm{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card input{position:absolute;top:8px;left:8px;width:18px;height:18px;accent-color:var(--sel)}
.card .tag{position:absolute;top:8px;right:8px;font-size:11px;background:#0006;padding:0 6px;border-radius:8px}
aside{background:var(--panel);border-radius:10px;padding:14px;align-self:start;position:sticky;top:70px}
aside h3{margin:4px 0 8px;font-size:14px}aside label{display:flex;gap:6px;align-items:center;margin:3px 0}
aside .row{display:flex;gap:8px;align-items:center;margin:6px 0}aside .row input,aside .row select{width:90px}
aside hr{border:0;border-top:1px solid var(--line);margin:14px 0}
.big{width:100%;margin-top:6px}.msg{color:var(--mute);font-size:12px;margin-top:6px;word-break:break-all}
#result img{max-width:100%;margin-top:8px;border-radius:6px;background:repeating-conic-gradient(#555 0 25%,#444 0 50%) 0 0/16px 16px}
dialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:18px;max-width:min(760px,95vw)}
dialog::backdrop{background:#000a}
.pv{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
.pv .master{width:256px;height:256px;border-radius:8px;background:repeating-conic-gradient(#555 0 25%,#444 0 50%) 0 0/16px 16px}
.sizes{display:grid;gap:8px}.sizes div{display:flex;gap:10px;align-items:center;padding:10px;border-radius:8px}
.sizes .dk{background:#313338}.sizes .lt{background:#fff}
.nav{display:flex;justify-content:space-between;margin-top:12px}
.groups{display:grid;gap:12px;align-content:start}
.grow{background:#25272b;border-radius:10px;padding:10px}
.grow h4{margin:0 0 8px;font-size:13px;font-weight:600}.grow h4 span{color:var(--mute);font-weight:400;margin-left:6px}
.grow .cards{display:flex;gap:10px;flex-wrap:wrap}.grow .card{width:132px}
.grow .tools{float:right;display:flex;gap:6px}.grow .tools button{padding:1px 8px;font-size:12px}
</style></head><body>
<header><h1>貼圖預覽</h1><span id="tabs"></span>
<select id="grp"><option value="0">全部組別</option><option value="1">第 1 組</option><option value="2">第 2 組</option><option value="3">第 3 組</option><option value="4">第 4 組</option></select>
<button id="all">全選此頁</button><button id="none">取消此頁</button><button id="inv">反選此頁</button><button id="clr">清空全部勾選</button>
<span class="sp"></span><span class="count" id="count">已勾選 0 張</span></header>
<main><div class="grid" id="grid"></div>
<aside>
<h3>勾選清單（JSON）</h3>
<div class="row" style="flex-wrap:wrap"><select id="sellist" style="width:100%"></select></div>
<div class="row"><button id="selload" style="flex:1">載入勾選</button><button id="selsave" style="flex:1">儲存目前勾選</button></div>
<div class="row"><button id="selfilebtn" style="flex:1">從檔案讀取…</button><input id="selfile" type="file" accept=".json,application/json" hidden></div>
<label><input type="checkbox" id="selmerge"> 載入時加到現有勾選（不取代）</label>
<div class="msg" id="selmsg">每次匯出、組合也會自動存一份 JSON</div>
<hr><h3>匯出（ZIP）</h3>
<div id="fmts"></div>
<div class="row">版本標記 <input id="ver" placeholder="選填，如 v1" style="width:110px" maxlength="20"></div>
<div class="msg" id="vermsg"></div>
<button class="big" id="exp">匯出勾選的貼圖</button><div class="msg" id="expmsg"></div>
<hr><h3>組合成一張圖</h3>
<div class="row">欄數 <input id="cols" type="number" min="1" max="32" value="8"></div>
<div class="row">格子 <select id="cell"><option>56</option><option>112</option><option selected>128</option><option>256</option><option>512</option></select> px</div>
<div class="row">間距 <input id="gap" type="number" min="0" max="64" value="8"> px</div>
<div class="row">背景 <select id="bg"><option value="transparent">透明</option><option value="dark">Discord 深色</option><option value="light">白色</option></select></div>
<label><input type="checkbox" id="labels"> 顯示名稱</label>
<button class="big" id="cmb">組合勾選的貼圖</button><div class="msg" id="cmbmsg"></div><div id="result"></div>
<div class="msg">檔案同時會存到資料夾裡的 exports\</div>
</aside></main>
<dialog id="dlg"><div id="dlgbody"></div><div class="nav"><button id="prev">← 上一張</button><label><input type="checkbox" id="dlgsel"> 勾選這張</label><button id="next">下一張 →</button></div></dialog>
<script>
const FMT={master:"Master 512",t112:"Twitch 112",t56:"Twitch 56",t28:"Twitch 28",discord:"Discord 128"};
let styles=[],cur=null,mode="single",sel=new Set(),view=[],di=-1;
const $=id=>document.getElementById(id), img=p=>"/img/"+p;
const key=(s,it)=>s.id+":"+it.id;
try{sel=new Set(JSON.parse(localStorage.getItem("sel")||"[]"));mode=localStorage.getItem("mode")||"single"}catch(e){}
const save=()=>{try{localStorage.setItem("sel",JSON.stringify([...sel]));localStorage.setItem("mode",mode)}catch(e){}; $("count").textContent=`已勾選 ${sel.size} 張`};
$("fmts").innerHTML=Object.entries(FMT).map(([k,v])=>`<label><input type="checkbox" value="${k}" ${k!="master"?"checked":""}> ${v}</label>`).join("");
async function load(){styles=await (await fetch("/api/styles")).json();
 $("tabs").innerHTML=`<button data-s="__all">並排比較（全部版本）</button> `+styles.map(s=>`<button data-s="${s.id}">${s.id}（${s.items.length}）</button>`).join(" ");
 $("tabs").onclick=e=>{const b=e.target.closest("button");if(!b)return;
  if(b.dataset.s=="__all"){mode="all"}else{mode="single";cur=styles.find(s=>s.id==b.dataset.s)}save();render()};
 cur=cur&&styles.find(s=>s.id==cur.id)||styles[0];render();save()}
function card(e,i){const k=key(e.s,e.it);return `<div class="card ${sel.has(k)?"sel":""}" data-i="${i}">
 <input type="checkbox" ${sel.has(k)?"checked":""}><span class="tag">${mode=="all"?e.s.id:"#"+e.it.id}</span>
 <img loading="lazy" src="${img(e.it.files.t112||e.it.files.master)}"><div class="nm">${mode=="all"?e.s.id:e.it.label}</div></div>`}
function render(){[...$("tabs").children].forEach(b=>b.classList.toggle("on",mode=="all"?b.dataset.s=="__all":b.dataset.s==cur.id));
 const g=+$("grp").value, ok=it=>!g||it.group==g;
 if(mode=="single"){view=cur.items.filter(ok).map(it=>({s:cur,it}));
  $("grid").className="grid";$("grid").innerHTML=view.map(card).join("");return}
 // 並排比較：以貼圖編號/名稱分組，每組列出所有版本
 const ids=[...new Set(styles.flatMap(s=>s.items.filter(ok).map(it=>it.id)))].sort((a,b)=>a-b);
 view=[];let html="";
 for(const id of ids){const row=styles.map(s=>({s,it:s.items.find(x=>x.id==id)})).filter(e=>e.it);
  const it0=row[0].it,start=view.length;view.push(...row);
  html+=`<div class="grow"><div class="tools"><button data-gs="${id}">全選此組</button><button data-gc="${id}">取消此組</button></div>
  <h4>#${id} ${it0.label}<span>${it0.zh||""}</span></h4><div class="cards">${row.map((e,j)=>card(e,start+j)).join("")}</div></div>`}
 $("grid").className="groups";$("grid").innerHTML=html}
function toggle(k,on){on?sel.add(k):sel.delete(k);save()}
$("grid").onclick=e=>{const gb=e.target.closest("button[data-gs],button[data-gc]");
 if(gb){const id=+(gb.dataset.gs||gb.dataset.gc),on=!!gb.dataset.gs;view.filter(v=>v.it.id==id).forEach(v=>toggle(key(v.s,v.it),on));render();return}
 const c=e.target.closest(".card");if(!c)return;const v=view[+c.dataset.i],k=key(v.s,v.it);
 if(e.target.tagName=="INPUT"){toggle(k,e.target.checked);c.classList.toggle("sel",e.target.checked);return}open(+c.dataset.i)};
$("grp").onchange=render;
$("all").onclick=()=>{view.forEach(v=>sel.add(key(v.s,v.it)));save();render()};
$("none").onclick=()=>{view.forEach(v=>sel.delete(key(v.s,v.it)));save();render()};
$("inv").onclick=()=>{view.forEach(v=>{const k=key(v.s,v.it);sel.has(k)?sel.delete(k):sel.add(k)});save();render()};
$("clr").onclick=()=>{sel.clear();save();render()};
function open(i){di=i;const {s,it}=view[i],f=it.files,k=key(s,it);
 const row=(cls)=>`<div class="${cls}">${["t112","t56","t28"].filter(x=>f[x]).map(x=>`<img src="${img(f[x])}" width="${x.slice(1)}" height="${x.slice(1)}">`).join("")}</div>`;
 $("dlgbody").innerHTML=`<h3 style="margin:0 0 10px">${s.id} · #${it.id} ${it.label} <span style="color:var(--mute);font-weight:400">${it.zh||""}</span></h3>
 <div class="pv"><img class="master" src="${img(f.master)}"><div class="sizes">${row("dk")}${row("lt")}
 <div class="msg">實際尺寸：112 / 56 / 28（Discord 深色、白色背景）</div></div></div>`;
 $("dlgsel").checked=sel.has(k);if(!$("dlg").open)$("dlg").showModal()}
$("dlgsel").onchange=e=>{const v=view[di];toggle(key(v.s,v.it),e.target.checked);render()};
$("prev").onclick=()=>open((di-1+view.length)%view.length);$("next").onclick=()=>open((di+1)%view.length);
$("dlg").onclick=e=>{if(e.target==$("dlg"))$("dlg").close()};
document.addEventListener("keydown",e=>{if(!$("dlg").open)return;if(e.key=="ArrowLeft")$("prev").click();if(e.key=="ArrowRight")$("next").click();if(e.key==" "){e.preventDefault();$("dlgsel").click()}});
async function post(u,b){const r=await fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j}
$("exp").onclick=async()=>{if(!sel.size)return $("expmsg").textContent="請先勾選貼圖";
 const formats=[...$("fmts").querySelectorAll("input:checked")].map(x=>x.value);if(!formats.length)return $("expmsg").textContent="請選至少一種格式";
 $("expmsg").textContent="匯出中…";try{const j=await post("/api/export",{keys:[...sel],formats,version:$("ver").value});
 $("expmsg").innerHTML=`完成：${j.count} 個檔案 → exports\\${j.file}`;location.href="/exports/"+j.file}catch(e){$("expmsg").textContent="失敗："+e.message}};
$("cmb").onclick=async()=>{if(!sel.size)return $("cmbmsg").textContent="請先勾選貼圖";$("cmbmsg").textContent="組合中…";
 try{const j=await post("/api/combine",{keys:[...sel],cols:+$("cols").value,cell:+$("cell").value,gap:+$("gap").value,bg:$("bg").value,labels:$("labels").checked});
 $("cmbmsg").innerHTML=`完成 → exports\\${j.file}`;$("result").innerHTML=`<a href="/exports/${j.file}" download><img src="/exports/${j.file}?t=${Date.now()}"></a><div class="msg">點圖片下載</div>`}
 catch(e){$("cmbmsg").textContent="失敗："+e.message}};
async function loadSelList(){try{const l=await (await fetch("/api/selections")).json();
 const kind={export:"匯出",combine:"組合",selection:"勾選"};
 $("sellist").innerHTML=l.length?l.map(x=>`<option value="${x.file}">${x.created||x.file}・${kind[x.kind]||""}・${x.count} 張</option>`).join(""):`<option value="">（還沒有存過的清單）</option>`}catch(e){}}
function applySel(d,src){const keys=d.keys||(d.items||[]).map(i=>i.key||`${i.style}:${i.id}`);
 const valid=new Set(styles.flatMap(s=>s.items.map(it=>key(s,it))));
 const ok=keys.filter(k=>valid.has(k)),miss=keys.length-ok.length;
 if(!$("selmerge").checked)sel.clear();ok.forEach(k=>sel.add(k));
 if(Array.isArray(d.formats))$("fmts").querySelectorAll("input").forEach(x=>x.checked=d.formats.includes(x.value));
 if(typeof d.version=="string"){$("ver").value=d.version;verPreview()}
 const c=d.combine;if(c){$("cols").value=c.cols??$("cols").value;$("cell").value=c.cell??$("cell").value;$("gap").value=c.gap??$("gap").value;$("bg").value=c.bg??$("bg").value;$("labels").checked=!!c.labels}
 save();render();$("selmsg").textContent=`已從 ${src} 載入 ${ok.length} 張`+(miss?`（${miss} 張找不到，已略過）`:"")}
$("selload").onclick=async()=>{const f=$("sellist").value;if(!f)return;
 try{applySel(await (await fetch("/exports/"+encodeURIComponent(f))).json(),f)}catch(e){$("selmsg").textContent="讀取失敗："+e.message}};
$("selfilebtn").onclick=()=>$("selfile").click();
$("selfile").onchange=async e=>{const f=e.target.files[0];if(!f)return;
 try{applySel(JSON.parse(await f.text()),f.name)}catch(err){$("selmsg").textContent="JSON 格式錯誤："+err.message}e.target.value=""};
$("selsave").onclick=async()=>{if(!sel.size)return $("selmsg").textContent="請先勾選貼圖";
 const formats=[...$("fmts").querySelectorAll("input:checked")].map(x=>x.value);
 const combine={cols:+$("cols").value,cell:+$("cell").value,gap:+$("gap").value,bg:$("bg").value,labels:$("labels").checked};
 try{const j=await post("/api/selection",{keys:[...sel],formats,combine,version:$("ver").value});$("selmsg").innerHTML=`已存成 exports\\${j.file}（<a href="/exports/${j.file}" download style="color:var(--acc)">下載</a>）`;loadSelList()}
 catch(e){$("selmsg").textContent="失敗："+e.message}};
const _exp=$("exp").onclick,_cmb=$("cmb").onclick;
$("exp").onclick=async()=>{await _exp();loadSelList()};$("cmb").onclick=async()=>{await _cmb();loadSelList()};
function verPreview(){const v=($("ver").value||"").replace(/[^A-Za-z0-9_-]/g,"");
 $("vermsg").textContent=`檔名範例：01_happy_s1${v?"_"+v:""}.png`}
$("ver").oninput=verPreview;verPreview();
load().then(loadSelList);
</script></body></html>"""


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    url = f"http://127.0.0.1:{PORT}"
    print(f"貼圖預覽已啟動：{url}（關閉這個視窗即可結束）")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
