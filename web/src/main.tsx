import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/huninn";   // jf open 粉圓（打包在本機，不需連網）
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
