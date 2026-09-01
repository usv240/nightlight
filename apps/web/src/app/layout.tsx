import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  fallback: ["Consolas", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Nightlight",
  description:
    "Nightlight uses the Ring doorbell a family already owns to watch the door at night, gently guide a loved one with dementia back inside using a familiar voice, and wake the caregiver only when it truly matters.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/*
  Theme is applied before first paint: an explicit choice is stamped on
  data-theme; the default (system) stamps nothing and the CSS media query
  decides. Stored choice read inside try/catch: storage can be unavailable.
*/
const themeScript = `(function(){try{var t=localStorage.getItem("nl-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
