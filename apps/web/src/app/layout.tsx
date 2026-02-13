import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "截码战 Decrypto Online",
  description: "Minimalist black and white online decrypto game"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
