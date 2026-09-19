"use client";

import { IconContext } from "@phosphor-icons/react";

// Every icon in this app is either purely decorative next to visible text, or
// sits inside an element that already carries its own aria-label — so hiding
// icons from the accessibility tree by default is the correct global setting.
export function IconDefaults({ children }: { children: React.ReactNode }) {
  return <IconContext.Provider value={{ "aria-hidden": true }}>{children}</IconContext.Provider>;
}
