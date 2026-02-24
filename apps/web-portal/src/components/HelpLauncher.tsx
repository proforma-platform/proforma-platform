"use client";

import { useEffect } from "react";
import {
  getPortalHelpConfig,
  initHelpLauncher,
} from "@proforma/ui/help-launcher";

export default function HelpLauncher() {
  useEffect(() => initHelpLauncher(getPortalHelpConfig()), []);
  return null;
}
