import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import '../styles/tokens.css';

/**
 * Noto Sans Thai — self-host ผ่าน next/font/google (ดาวน์โหลดครั้งเดียวตอน build
 * แล้วให้บริการจาก origin เรา ไม่ผ่าน Google CDN ตอน runtime → สอดคล้อง H10)
 * สร้างตัวแปร --font-noto ให้ tokens.css อ้างอิง
 */
const noto = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-noto',
  display: 'swap',
  preload: true,
});

const baseUrl = process.env.AUTH_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Subdistrict Works — แจ้งเหตุ/ติดตามงานบริการสาธารณูปโภค',
    template: '%s · Subdistrict Works',
  },
  description:
    'ระบบแจ้งเหตุ/ติดตามงานบริการสาธารณูปโภค Subdistrict Works (อ.เดโม จ.เดโม) — แจ้งเรื่องได้ ติดตามได้ ตรวจสอบได้',
  applicationName: 'Subdistrict Works Citizen Help',
  keywords: [
    'Subdistrict Works',
    'SW',
    'แจ้งเหตุ',
    'ติดตามงาน',
    'บริการสาธารณูปโภค',
    'ร้องเรียก',
    'ร้องทุกข์',
  ],
  authors: [{ name: 'Subdistrict Works' }],
  creator: 'Subdistrict Works',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: baseUrl,
    siteName: 'Subdistrict Works Citizen Help',
    title: 'Subdistrict Works — แจ้งเหตุ/ติดตามงานบริการสาธารณูปโภค',
    description:
      'ระบบแจ้งเหตุ/ติดตามงานบริการสาธารณูปโภค Subdistrict Works (อ.เดโม จ.เดโม)',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
};

/**
 * themeColor = สีแถบ browser บนมือถือ ต้องตรงกับ --color-surface ของแต่ละธีม
 *
 * § ต้องเป็น hex ไม่ใช่ oklch — meta[name=theme-color] ยังไม่รองรับ oklch ในหลาย
 * browser ค่าด้านล่างจึงเป็นผลแปลงจาก token โดยตรง (ไม่ใช่สีที่เลือกเอง):
 *   light = oklch(99% 0.005 5)  → #fffafb
 *   dark  = oklch(15% 0.015 5)  → #11090a
 * ถ้าเปลี่ยน --color-surface ต้องแปลงใหม่แล้วมาแก้ที่นี่ด้วย
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffafb' },
    { media: '(prefers-color-scheme: dark)', color: '#11090a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" data-theme="light" className={noto.variable} suppressHydrationWarning>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
