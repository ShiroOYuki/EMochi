import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/huninn"; // jf open 粉圓（打包在本機，不需連網）
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { queryClient } from "./api";
import { createAppRouter } from "./router";
import { loadThemePref } from "./theme";

loadThemePref(); // 主題偏好以伺服器的設定檔為準（localStorage 只是快取）
const router = createAppRouter(App); // App 是 Layout：Navbar＋五個分頁

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
