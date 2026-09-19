import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cover Letter Profile",
};

export default function ProfileLayout({ children }: LayoutProps<"/profile">) {
  return children;
}
