import { configureStore } from "@reduxjs/toolkit";
import { useDispatch } from "react-redux";

import { isNodeEnvProd } from "./app.constants";
import { directoriesReducer } from "./directories/directories.redux";
import { scrollToPageTopReducer } from "./scroll-to-page-top/scroll-to-page-top.redux";

export const makeStore = () =>
  configureStore({
    reducer: {
      directories: directoriesReducer,
      scrollToPageTop: scrollToPageTopReducer,
    },
    devTools: !isNodeEnvProd,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
  });

export type AppStore = ReturnType<typeof makeStore>;

/** One store for the static site; nothing is hydrated from the server. */
export const store = makeStore();

export type AppDispatch = ReturnType<typeof makeStore>["dispatch"];
export const useAppDispatch: () => AppDispatch = useDispatch;
