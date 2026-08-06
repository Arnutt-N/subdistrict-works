import type { Preview, StoryContext } from '@storybook/react';
import '../src/styles/tokens.css';

/**
 * .storybook/preview.tsx
 * - โหลด design tokens ทุก story (Tailwind v4 @theme inline → utilities ใช้ได้)
 * - a11y addon รัน axe ทุก story (gate)
 * - toolbar toggle light/dark ผ่าน [data-theme]
 * - ภาษาไทย + font-sans (Noto Sans Thai)
 */

const preview: Preview = {
  parameters: {
    a11y: {
      // axe default rules + บังคับ button-name, label, color-contrast
      options: {},
    },
    backgrounds: {
      options: {
        // § light อ้าง token ตรง ๆ ได้ แต่ dark ต้อง hardcode
        // addon ทาสีลง `.sb-show-main` ซึ่งเป็น ancestor ของ div ที่ decorator
        // ตั้ง [data-theme] ไว้ (ดูด้านล่าง) — var(--color-surface) จึง resolve
        // เป็นค่าใน :root (light) เสมอ ไม่ว่าจะ toggle ธีมอะไรในทูลบาร์
        //
        // ⚠️ ค่า dark ด้านล่างเป็นสำเนาของ [data-theme='dark'] --color-surface
        // ใน tokens.css ต้องแก้ตามทุกครั้งที่หมุน hue — ตกค้างมาแล้ว 2 รอบ
        // (hue 245 → 255 → ปัจจุบัน 24)
        light: { name: 'light (default)', value: 'var(--color-surface)' },
        dark: { name: 'dark (intentional)', value: 'oklch(15% 0.015 24)' },
      },
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  globalTypes: {
    theme: {
      name: 'ธีม',
      description: 'light/dark (DESIGN.md: ไม่ default dark)',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context: StoryContext) => {
      const theme = (context.globals['theme'] as 'light' | 'dark') ?? 'light';
      return (
        <div data-theme={theme} lang="th" className="min-h-dvh bg-surface p-8 font-sans text-ink">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;