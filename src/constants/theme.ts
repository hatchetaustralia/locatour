/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Brand design tokens — extracted from the Figma "Mobile UI 2" board
 * (file ggmUGOX5tNYKzaperWocKN). This is the real visual language: a warm
 * cream "passport / ticket-stub" aesthetic with a teal primary action and
 * playful rotated stamp stickers. Use these everywhere instead of the
 * generic Colors above when building product screens.
 */
export const Brand = {
  bg: '#FCF0E8', // cream page background
  surface: '#FFFFFF', // input / card fills
  ink: '#2A2421', // primary text, borders, dark buttons
  inkSecondary: '#625650', // secondary text
  inkSubtle: '#B5A9A3', // placeholders, dividers
  teal: '#7DE3E7', // primary action button
  purple: '#8141DC', // link / accent text
  link: '#8E847F',
  sticker: {
    green: '#7DCE96',
    pink: '#EA739C',
    purple: '#8141DC',
    gold: '#F0B730',
  },
} as const;

/** Poppins family names registered by useFonts in the root layout. */
export const BrandFonts = {
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const BrandRadius = {
  control: 8, // buttons / inputs
  sticker: 12, // rectangular stamp stickers
  pill: 999,
} as const;

/**
 * The signature "stamp" border: a thin dark-brown outline with a heavier 2px
 * bottom edge, giving controls a subtle printed/embossed ticket look. Spread
 * into a style: `style={[styles.btn, stampBorder]}`.
 */
export const stampBorder = {
  borderWidth: 1,
  borderBottomWidth: 2,
  borderColor: Brand.ink,
  borderRadius: BrandRadius.control,
} as const;
