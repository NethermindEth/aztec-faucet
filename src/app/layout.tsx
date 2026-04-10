import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Image from "next/image";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aztec Faucet",
  description: "Get test tokens for the Aztec testnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased overflow-x-hidden min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        {children}
        <footer className="flex flex-col items-center gap-2 pb-8 pt-4">
          <Image
            src="/powered-by-nethermind-dark.svg"
            alt="Powered by Nethermind"
            width={160}
            height={22}
          />
          <p className="text-[11px] text-zinc-600">Released under the MIT License.</p>
          <p className="text-[11px] text-zinc-600">© 2026 Nethermind. All Rights Reserved</p>
        </footer>
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            async
            defer
          />
        )}
        {process.env.NEXT_PUBLIC_CLARITY_TAG_ID && (
          <Script
            id="microsoft-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${process.env.NEXT_PUBLIC_CLARITY_TAG_ID}");`
            }}
          />
        )}
      </body>
    </html>
  );
}
