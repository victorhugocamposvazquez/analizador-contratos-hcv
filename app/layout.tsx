import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analizador de contratos HCV",
  description: "Detector de duplicados de contratos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
