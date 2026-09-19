import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { publicEnv } from "../lib/public-env";
import { Providers } from "./providers";
import "../styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: publicEnv.NEXT_PUBLIC_APP_NAME,
  description: "Jewellery management for Aabhushan staff.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-primary text-primary min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
