/**
 * Brand UI kit — the shared building blocks of the Figma "Mobile UI 2" design
 * language (warm cream "passport / ticket-stub" aesthetic). Screens should
 * compose these instead of re-implementing the stamp border, Poppins text and
 * sticker decorations each time.
 */
import React from 'react';
import {
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Brand, BrandFonts, stampBorder } from '@/constants/theme';

// Passport-stamp stickers as crisp vectors (react-native-svg-transformer turns a
// `.svg` import into a component). Exported from the Figma board, backgrounds
// stripped so they composite transparently on the cream page.
import StickerBootSvg from '../../../assets/images/brand/sticker-boot.svg';
import StickerCameraSvg from '../../../assets/images/brand/sticker-camera.svg';
import StickerHatSvg from '../../../assets/images/brand/sticker-hat.svg';
import StickerHikingSvg from '../../../assets/images/brand/sticker-hiking.svg';
import StickerCoinTealSvg from '../../../assets/images/brand/sticker-coin-teal.svg';

// ---------------------------------------------------------------------------
// Assets (logo + the four passport-stamp stickers, exported from Figma).
// Stickers already include their rotation + drop shadow baked in, and their
// transparent corners are filled with the cream page colour, so they composite
// seamlessly on a Brand.bg background.
// ---------------------------------------------------------------------------
export const BrandAssets = {
  logo: require('../../../assets/images/brand/logo-wordmark.png'),
  googleG: require('../../../assets/images/brand/google-g.png'),
  stickerBoot: require('../../../assets/images/brand/sticker-boot.png'),
  stickerCamera: require('../../../assets/images/brand/sticker-camera.png'),
  stickerHat: require('../../../assets/images/brand/sticker-hat.png'),
  stickerHiking: require('../../../assets/images/brand/sticker-hiking.png'),
  // Teal coin (recoloured from the green S coin) so the scatter includes a blue.
  stickerCoinTeal: require('../../../assets/images/brand/sticker-coin-teal.png'),
  // Pre-blurred copies used as soft, out-of-focus background stamps (depth).
  stickerBootBlur: require('../../../assets/images/brand/sticker-boot-blur.png'),
  stickerCameraBlur: require('../../../assets/images/brand/sticker-camera-blur.png'),
  stickerHatBlur: require('../../../assets/images/brand/sticker-hat-blur.png'),
  stickerHikingBlur: require('../../../assets/images/brand/sticker-hiking-blur.png'),
  stickerCoinTealBlur: require('../../../assets/images/brand/sticker-coin-teal-blur.png'),
} as const;

// ---------------------------------------------------------------------------
// BrandText — Poppins text in one of the three registered weights.
// ---------------------------------------------------------------------------
type Weight = 'medium' | 'semibold' | 'bold';
const fontFor: Record<Weight, string> = {
  medium: BrandFonts.medium,
  semibold: BrandFonts.semibold,
  bold: BrandFonts.bold,
};

export function BrandText({
  weight = 'medium',
  style,
  color = Brand.ink,
  ...rest
}: TextProps & { weight?: Weight; color?: string }) {
  // includeFontPadding:false removes the extra top/bottom padding Android bakes
  // into text — the usual culprit for labels sitting visually off-centre inside
  // pills/badges. Setting it here fixes vertical alignment app-wide (no-op on iOS).
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fontFor[weight], color, includeFontPadding: false }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// StampButton — the signature pill button with the heavy bottom border.
// ---------------------------------------------------------------------------
type StampVariant = 'primary' | 'dark' | 'white';

export function StampButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconImage,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: StampVariant;
  /** Optional leading Ionicons glyph. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional leading image (e.g. Google/Apple logo). */
  iconImage?: number;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary' ? Brand.teal : variant === 'dark' ? Brand.ink : Brand.surface;
  const fg = variant === 'dark' ? Brand.bg : Brand.ink;
  const uppercase = variant === 'primary';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, stampBorder, { backgroundColor: bg }, (disabled || loading) && { opacity: 0.6 }, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {iconImage ? <Image source={iconImage} style={styles.btnIconImg} resizeMode="contain" /> : null}
          {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
          <BrandText
            weight="bold"
            color={fg}
            style={[styles.btnLabel, uppercase && styles.btnLabelUpper]}
          >
            {label}
          </BrandText>
        </>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// StampInput — white field with a leading icon and the stamp border.
// ---------------------------------------------------------------------------
export function StampInput({
  icon,
  style,
  inputStyle,
  ...rest
}: TextInputProps & {
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.input, stampBorder, style]}>
      {icon ? <Ionicons name={icon} size={20} color={Brand.inkSubtle} /> : null}
      <TextInput
        placeholderTextColor={Brand.inkSubtle}
        style={[styles.inputField, inputStyle]}
        {...rest}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sticker — a single passport-stamp decoration.
// ---------------------------------------------------------------------------
// Sharp stamps = crisp SVG components. preserveAspectRatio (default on
// react-native-svg) means a square width×height box just "contains" wider cards
// without distorting them — same effect the PNGs got from resizeMode="contain".
const STICKERS_SVG = {
  boot: StickerBootSvg,
  camera: StickerCameraSvg,
  hat: StickerHatSvg,
  hiking: StickerHikingSvg,
  teal: StickerCoinTealSvg,
} as const;

// Soft background copies stay raster (SVG gaussian blur is unreliable on Android).
const STICKERS_BLUR = {
  boot: BrandAssets.stickerBootBlur,
  camera: BrandAssets.stickerCameraBlur,
  hat: BrandAssets.stickerHatBlur,
  hiking: BrandAssets.stickerHikingBlur,
  teal: BrandAssets.stickerCoinTealBlur,
} as const;

export function Sticker({
  kind,
  size = 90,
  blur = false,
  style,
}: {
  kind: keyof typeof STICKERS_SVG;
  size?: number;
  /** Use the soft, out-of-focus raster copy (for background depth). */
  blur?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  if (blur) {
    return (
      <Image
        source={STICKERS_BLUR[kind]}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    );
  }
  const Svg = STICKERS_SVG[kind];
  return <Svg width={size} height={size} style={style as StyleProp<ViewStyle>} />;
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  btnLabel: {
    fontSize: 14,
  },
  btnLabelUpper: {
    letterSpacing: 0.7,
  },
  btnIconImg: {
    width: 20,
    height: 20,
  },
  input: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    backgroundColor: Brand.surface,
  },
  inputField: {
    flex: 1,
    height: '100%',
    fontFamily: BrandFonts.medium,
    fontSize: 14,
    color: Brand.ink,
    // Vertically centre the text/placeholder in the 40px row. Android otherwise
    // top-aligns and adds font padding, clipping the top of the text.
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
