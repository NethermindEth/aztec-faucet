import type { Metadata } from "next";
import { Newsreader, Manrope, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { BufferPolyfillMount } from "@/components/buffer-polyfill-mount";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
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
        className={`${newsreader.variable} ${manrope.variable} ${spaceGrotesk.variable} antialiased overflow-x-hidden min-h-screen flex flex-col font-[family-name:var(--font-manrope)] text-[var(--on-surface)] select-none`}
        suppressHydrationWarning
      >
        {/* Patch globalThis.Buffer.prototype before any other client JS runs.
            Some Aztec SDK serialize paths use Buffer.writeBigUInt64BE which is
            missing from Turbopack's slim Buffer shim. */}
        <Script id="buffer-bigint-shim" strategy="beforeInteractive">
          {`
(function(){
  if (typeof globalThis === "undefined" || !globalThis.Buffer) return;
  var p = globalThis.Buffer.prototype;
  if (p.writeBigUInt64BE && p.readBigUInt64BE) return;
  if (typeof p.writeBigUInt64BE !== "function") {
    p.writeBigUInt64BE = function(v, o){ o=o||0; this.writeUInt32BE(Number((v>>32n)&0xffffffffn),o); this.writeUInt32BE(Number(v&0xffffffffn),o+4); return o+8; };
  }
  if (typeof p.writeBigUInt64LE !== "function") {
    p.writeBigUInt64LE = function(v, o){ o=o||0; this.writeUInt32LE(Number(v&0xffffffffn),o); this.writeUInt32LE(Number((v>>32n)&0xffffffffn),o+4); return o+8; };
  }
  if (typeof p.writeBigInt64BE !== "function") {
    p.writeBigInt64BE = function(v, o){ var u = v < 0n ? v + (1n<<64n) : v; return p.writeBigUInt64BE.call(this, u, o); };
  }
  if (typeof p.writeBigInt64LE !== "function") {
    p.writeBigInt64LE = function(v, o){ var u = v < 0n ? v + (1n<<64n) : v; return p.writeBigUInt64LE.call(this, u, o); };
  }
  if (typeof p.readBigUInt64BE !== "function") {
    p.readBigUInt64BE = function(o){ o=o||0; return (BigInt(this.readUInt32BE(o))<<32n)|BigInt(this.readUInt32BE(o+4)); };
  }
  if (typeof p.readBigUInt64LE !== "function") {
    p.readBigUInt64LE = function(o){ o=o||0; return (BigInt(this.readUInt32LE(o+4))<<32n)|BigInt(this.readUInt32LE(o)); };
  }
  if (typeof p.readBigInt64BE !== "function") {
    p.readBigInt64BE = function(o){ var u = p.readBigUInt64BE.call(this, o); return u >= (1n<<63n) ? u - (1n<<64n) : u; };
  }
  if (typeof p.readBigInt64LE !== "function") {
    p.readBigInt64LE = function(o){ var u = p.readBigUInt64LE.call(this, o); return u >= (1n<<63n) ? u - (1n<<64n) : u; };
  }
})();
          `}
        </Script>
        <BufferPolyfillMount />
        {/* Grain texture overlay */}
        <div className="grain" />
        {children}
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
