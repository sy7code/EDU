import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import "./index.css";
import { applySkin, readStoredSkin, rememberSkinFromUrl, resolveSkin } from "./lib/skin";

// 화면 테마: 빌드 값 VITE_THEME=pink 또는 주소 ?skin=pink (기본은 초록). 주소로 고른 값은 이 탭에서 유지
rememberSkinFromUrl(window.location.search);
applySkin(resolveSkin(import.meta.env.VITE_THEME, window.location.search, readStoredSkin()));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
