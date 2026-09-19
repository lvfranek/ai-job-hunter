import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Scoring Preferences",
};

export default function PreferencesLayout({ children }: LayoutProps<"/preferences">) {
  return children;
}
