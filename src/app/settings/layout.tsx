import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scraping Settings",
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return children;
}
