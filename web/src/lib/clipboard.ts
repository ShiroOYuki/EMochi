export const copyText = (t: string) => {
  navigator.clipboard?.writeText(t).catch(() => {});
};

// ---------- 總垃圾桶（側欄左下角） ----------
