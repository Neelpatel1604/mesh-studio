import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mesh Studio (Next.js)",
  description: "Industrial 3D viewport with React Three Fiber",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
