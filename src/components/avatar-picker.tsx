/**
 * AvatarPicker — the slide-up bottom-sheet for choosing a profile avatar.
 *
 * Used by both the onboarding "Create profile" screen and the profile edit
 * screen. Offers:
 *  - the user's auth/provider (Google) photo, when one was captured at sign-in,
 *    as an always-available option (kept separate from the current avatar so it
 *    stays selectable after a preset is picked);
 *  - a level-gated grid of dicebear presets (AVATAR_CATALOG). Presets above the
 *    user's level render dimmed with a lock + "Lvl N"; tapping one shows a brief
 *    "Unlocks at level N" hint instead of selecting it.
 *
 * Sheet mechanics mirror SuggestLocationSheet: a React Native <Modal> with a
 * per-Modal GestureHandlerRootView, the card sliding on its own translateY while
 * the backdrop fades. Drag-to-dismiss MUST use react-native-gesture-handler (not
 * PanResponder) because the sheet lives in a Modal — a separate native window on
 * Android where PanResponder move events don't propagate. The drag gesture is
 * attached only to the header/grabber so the grid scrolls freely.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import { BrandText } from '@/components/brand';
import { Brand, Spacing, stampBorder, BrandRadius } from '@/constants/theme';
import { AVATAR_CATALOG, AvatarPreset, isAvatarUnlocked, avatarUri } from '@/utils/avatar';

// Four columns; the tile size is derived from the sheet's inner width so the grid
// fills the row edge-to-edge with even gaps.
const COLUMNS = 4;
const GRID_GAP = Spacing.three; // 16
const SHEET_H_PADDING = Spacing.three; // 16
const TILE = Math.floor(
  (Dimensions.get('window').width - SHEET_H_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
);

export function AvatarPicker({
  visible,
  currentAvatar,
  providerAvatarUrl,
  currentLevel,
  onSelect,
  onClose,
}: {
  visible: boolean;
  /** The currently-selected avatar URL (drives the "selected" tick). */
  currentAvatar?: string | null;
  /** The stored Google/provider photo, shown as an always-available option. */
  providerAvatarUrl?: string | null;
  /** The user's level — presets unlock at or above their minLevel. */
  currentLevel: number;
  /** Called with the chosen avatar URL; the sheet then animates closed. */
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  // Keep the Modal mounted through the close animation (see SuggestLocationSheet).
  const [mounted, setMounted] = useState(visible);
  // The transient "Unlocks at level N" hint shown when a locked tile is tapped.
  const [lockHint, setLockHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SHEET_CLOSED_Y = Dimensions.get('window').height;
  const translateY = useRef(new Animated.Value(SHEET_CLOSED_Y)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHEET_CLOSED_Y, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [translateY, backdropOpacity, SHEET_CLOSED_Y, onClose]);

  // Drag-to-dismiss on the header only (the grid owns its own scroll). Activates
  // on a downward drag past a small threshold; a short flick or a past-110px drag
  // dismisses, otherwise the card springs back.
  const sheetDrag = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetY(-8)
    .runOnJS(true)
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.setValue(e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110) {
        closeSheet();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      }
    });

  // Mount + spring the card up on open; trail `visible` on close.
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setLockHint(null);
      translateY.setValue(SHEET_CLOSED_Y);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      setMounted(false);
    }
  }, [visible, translateY, backdropOpacity, SHEET_CLOSED_Y]);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  // Pick an avatar: select + close on an unlocked tile; flash the unlock hint on a
  // locked one (without selecting it).
  const pick = (preset: AvatarPreset) => {
    if (!isAvatarUnlocked(preset, currentLevel)) {
      setLockHint(`Unlocks at level ${preset.minLevel}`);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setLockHint(null), 1800);
      return;
    }
    onSelect(preset.url);
    closeSheet();
  };

  const provider = (providerAvatarUrl || '').trim();
  // Compare against the resolved (PNG-coerced) form so a stored /svg avatar still
  // matches the tile it came from.
  const selected = avatarUri(currentAvatar || undefined);

  const renderTile = (
    key: string,
    url: string,
    opts: { locked?: boolean; minLevel?: number; isSelected: boolean; onPress: () => void },
  ) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.85}
      onPress={opts.onPress}
      style={[styles.tile, stampBorder, styles.roundedFull, opts.isSelected && styles.tileSelected]}
    >
      <Image source={{ uri: url }} style={[styles.tileImage, opts.locked && styles.tileImageLocked]} />
      {opts.locked ? (
        <View style={styles.lockOverlay}>
          <Ionicons name="lock-closed" size={16} color={Brand.surface} />
          <BrandText weight="bold" color={Brand.surface} style={styles.lockLabel}>
            Lvl {opts.minLevel}
          </BrandText>
        </View>
      ) : null}
      {opts.isSelected && !opts.locked ? (
        <View style={styles.checkmarkBadge}>
          <Ionicons name="checkmark" size={11} color={Brand.surface} />
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={closeSheet}>
      <GestureHandlerRootView style={styles.modalRoot}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="none"
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />

        <Animated.View style={[styles.sheet, stampBorder, { transform: [{ translateY }] }]}>
          {/* Header is the drag handle; the grid below scrolls independently. */}
          <GestureDetector gesture={sheetDrag}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              <View style={styles.titleRow}>
                <Ionicons name="happy-outline" size={22} color={Brand.purple} />
                <BrandText weight="bold" style={styles.title}>
                  Choose your avatar
                </BrandText>
              </View>
              {lockHint ? (
                <View style={styles.hintRow}>
                  <Ionicons name="lock-closed" size={14} color={Brand.sticker.pink} />
                  <BrandText weight="medium" style={styles.hintText}>
                    {lockHint}
                  </BrandText>
                </View>
              ) : null}
            </View>
          </GestureDetector>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {provider ? (
              <View style={styles.section}>
                <BrandText weight="medium" color={Brand.inkSecondary} style={styles.sectionLabel}>
                  Your photo
                </BrandText>
                <View style={styles.grid}>
                  {renderTile('__provider__', avatarUri(provider), {
                    isSelected: selected === avatarUri(provider),
                    onPress: () => {
                      onSelect(provider);
                      closeSheet();
                    },
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.sectionLabel}>
                Pick a character
              </BrandText>
              <View style={styles.grid}>
                {AVATAR_CATALOG.map((preset) => {
                  const locked = !isAvatarUnlocked(preset, currentLevel);
                  return renderTile(preset.id, preset.url, {
                    locked,
                    minLevel: preset.minLevel,
                    isSelected: selected === preset.url,
                    onPress: () => pick(preset),
                  });
                })}
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42,36,33,0.35)',
  },
  sheet: {
    backgroundColor: Brand.bg,
    borderTopLeftRadius: BrandRadius.sticker,
    borderTopRightRadius: BrandRadius.sticker,
    paddingHorizontal: SHEET_H_PADDING,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    maxHeight: '78%',
  },
  header: {
    paddingBottom: Spacing.two,
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: BrandRadius.pill,
    backgroundColor: 'rgba(42,36,33,0.22)',
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    color: Brand.ink,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.two,
  },
  hintText: {
    fontSize: 13,
    color: Brand.sticker.pink,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingTop: Spacing.two,
  },
  section: {
    marginBottom: Spacing.three,
  },
  sectionLabel: {
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    width: TILE,
    height: TILE,
    backgroundColor: Brand.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelected: {
    borderColor: Brand.purple,
    borderWidth: 2,
    borderBottomWidth: 3,
  },
  roundedFull: {
    borderRadius: BrandRadius.pill,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileImageLocked: {
    opacity: 0.35,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: 'rgba(42,36,33,0.28)',
  },
  lockLabel: {
    fontSize: 11,
  },
  checkmarkBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
