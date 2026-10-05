import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistics",
};

export default function StatsLayout({ children }: LayoutProps<"/stats">) {
  return children;
}
