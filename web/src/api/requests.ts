// 請求 body 的型別：從後端的 Pydantic model 自動產生（schema.d.ts，npm run gen:api），
// 後端改了欄位、重新產生後這裡就跟著變，前端用錯 TypeScript 會直接報錯
import type { components } from "./schema";

type Schemas = components["schemas"];
/** 後端 Pydantic model 的 JSON 形狀，例如 Body<"ProjectPatch"> */
export type Body<K extends keyof Schemas> = Schemas[K];
