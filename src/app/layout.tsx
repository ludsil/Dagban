import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dagban",
  description: "Kanban-style project visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
