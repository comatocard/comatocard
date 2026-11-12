"use client";

import { useContext } from "react";
import { VaultContext } from "../providers/VaultProvider";

export const useVault = () => useContext(VaultContext);
