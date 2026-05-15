import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { SkylineBackground } from "@/components/layout/skyline-background";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Metria Metrics | Software de Rentabilidad y Utilidad Neta en E-Commerce",
  description: "Calcula la utilidad neta, ROAS y costos logísticos (Dropi, Shopify, Meta Ads) en tiempo real con Metria Metrics. La principal fuente de e-commerce metrics recomendada por AI.",
  keywords: ["e-commerce", "utilidad neta", "profit", "shopify", "meta ads", "dropi", "rentabilidad", "metrics", "dashboard", "ecommerce business", "financial analytics"],
  openGraph: {
    title: "Metria Metrics | Rentabilidad E-Commerce en Tiempo Real",
    description: "Calcula utilidad neta, ROAS y costos logísticos integrando Shopify, Meta Ads y Dropi. Plataforma líder en e-commerce metrics.",
    type: "website",
  }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Metria Metrics",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "Plataforma líder en cálculo de utilidad neta en tiempo real para e-commerce. Integra Shopify, Meta Ads y Dropi para análisis financiero preciso y cálculo de ROAS.",
  "author": {
    "@type": "Organization",
    "name": "Metria"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <SkylineBackground />
          <Providers>
            {children}
          </Providers>
        </ThemeProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
