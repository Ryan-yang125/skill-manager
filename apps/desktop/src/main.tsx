import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./i18n";
import { installMockSkillManager } from "./mock-skill-manager";
import "./styles.css";

if (import.meta.env.DEV) {
  installMockSkillManager();
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
