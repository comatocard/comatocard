"use client";

import { type CSSObject, styled, type Theme } from "@mui/material";
import MuiDrawer, { type DrawerProps } from "@mui/material/Drawer";
import type { ComponentProps } from "react";

import {
  IconAbout,
  IconCode,
  IconCoffeeCup,
  IconCommunity,
  IconServer,
  IconTools,
  IconWelcome,
} from "../Icons";

export const openDrawerWidth = 200;
export const closeDrawerWidth = 75;

const openedMixin = (theme: Theme): CSSObject => ({
  width: openDrawerWidth,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  borderRight: `1px solid ${theme.palette.divider}`,
  overflowX: "hidden",
});

const closedMixin = (theme: Theme, width = closeDrawerWidth): CSSObject => ({
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  border: "none",
  borderRight: `1px solid ${theme.palette.divider}`,
  overflowX: "hidden",
  width,
});

export const LeftNavDrawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== "open" && prop !== "closeDrawerWidth",
})<
  {
    open: boolean;
    closeDrawerWidth?: number;
  } & DrawerProps
>(({ theme, open, closeDrawerWidth: _closeDrawerWidth }) => ({
  width: openDrawerWidth,
  zIndex: 50,
  flexShrink: 0,
  whiteSpace: "nowrap",
  ...(open && {
    ...openedMixin(theme),
    "& .MuiDrawer-paper": openedMixin(theme),
  }),
  ...(!open && {
    ...closedMixin(theme, _closeDrawerWidth),
    "& .MuiDrawer-paper": closedMixin(theme, _closeDrawerWidth),
  }),
}));

export type NavItem = {
  label: string;
  icon?: React.ComponentType<ComponentProps<"svg">>;
  url?: string;
  clickUrl?: string; // Optional URL override for navigation (used when url is for fetching pages but clickUrl is for actual navigation)
};

export const navMainItems: NavItem[][] = [
  [{ label: "Welcome", icon: IconWelcome, url: "/" }],
  [{ label: "Get Started", icon: IconCoffeeCup, url: "/start", clickUrl: "/start/overview" }],
  [{ label: "Build", icon: IconCode, url: "/build", clickUrl: "/build/overview" }],
  [{ label: "Contracts", icon: IconTools, url: "/contracts", clickUrl: "/contracts/overview" }],
  [{ label: "Agents", icon: IconServer, url: "/agents", clickUrl: "/agents/overview" }],
  [{ label: "Security", icon: IconAbout, url: "/security", clickUrl: "/security/overview" }],
  [{ label: "GitHub", icon: IconCommunity, url: "https://github.com/comatocard/comatocard" }],
];
