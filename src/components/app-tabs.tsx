import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, Image, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandText } from '@/components/brand';
import { Brand } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { avatarUri } from '@/utils/avatar';

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_COUNT = 4;
const PILL_INSET = 8; // horizontal gap between the sliding pill and the tab cell

// Universal floating pill nav (web + native). The ACTIVE tab is a brand-purple
// "button" pill that SLIDES to the tapped tab; the active icon rides on top of it
// in cream, inactive icons are ink outlines. The Profile tab shows the user's
// avatar with a level badge.
export default function AppTabs() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  // The MAP (the `index` route `/`, tab index 0) is the landing screen (see
  // (tabs)/_layout.tsx's initialRouteName) and the FIRST tab, so start the
  // sliding pill on it — no flash of home before the focused trigger reports in.
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;
    storage.getUser().then((user) => {
      if (!active || !user) return;
      setAvatar(avatarUri(user.avatarUrl, user.displayName));
      setLevel(user.stats?.currentLevel ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <TabBar activeIndex={activeIndex}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton index={0} iconOn="location" iconOff="location-outline" onActive={setActiveIndex} />
          </TabTrigger>
          <TabTrigger name="camera" href="/camera" asChild>
            <TabButton index={1} iconOn="camera" iconOff="camera-outline" onActive={setActiveIndex} />
          </TabTrigger>
          <TabTrigger name="home" href="/home" asChild>
            <TabButton index={2} iconOn="ribbon" iconOff="ribbon-outline" onActive={setActiveIndex} />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton index={3} iconOn="person" iconOff="person-outline" onActive={setActiveIndex} avatarUrl={avatar} level={level} />
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

// `TabList asChild` clones this and injects props (incl. the trigger children)
// that MUST be spread onto the root element — so spread {...props} here.
function TabBar({ children, activeIndex, ...props }: TabListProps & { activeIndex: number }) {
  const insets = useSafeAreaInsets();
  const [innerWidth, setInnerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const tabWidth = innerWidth > 0 ? innerWidth / TAB_COUNT : 0;

  useEffect(() => {
    if (tabWidth <= 0) return;
    Animated.spring(translateX, {
      toValue: activeIndex * tabWidth,
      useNativeDriver: true,
      bounciness: 7,
      speed: 13,
    }).start();
  }, [activeIndex, tabWidth, translateX]);

  return (
    <View {...props} style={[styles.bar, { bottom: insets.bottom + 8 }]}>
      <View style={styles.inner} onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: tabWidth - PILL_INSET * 2,
                transform: [{ translateX }],
                // Fully round the OUTER corners at the ends so the pill nests
                // cleanly inside the bar's rounded left/right; inner corners stay
                // softer. Map = left end, Profile/avatar = right end.
                borderTopLeftRadius: activeIndex === 0 ? 22 : 16,
                borderBottomLeftRadius: activeIndex === 0 ? 22 : 16,
                borderTopRightRadius: activeIndex === TAB_COUNT - 1 ? 22 : 16,
                borderBottomRightRadius: activeIndex === TAB_COUNT - 1 ? 22 : 16,
              },
            ]}
          />
        )}
        {children}
      </View>
    </View>
  );
}

function TabButton({
  isFocused,
  iconOn,
  iconOff,
  index,
  onActive,
  avatarUrl,
  level,
  ...props
}: TabTriggerSlotProps & {
  iconOn: IconName;
  iconOff: IconName;
  index: number;
  onActive: (i: number) => void;
  avatarUrl?: string | null;
  level?: number | null;
}) {
  // Report focus up so the bar can slide the pill to this tab.
  useEffect(() => {
    if (isFocused) onActive(index);
  }, [isFocused, index, onActive]);

  // Profile tab → render the user's avatar with a level badge.
  if (avatarUrl !== undefined) {
    return (
      <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
        <View style={[styles.avatarWrap, isFocused && styles.avatarWrapActive]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Ionicons name={isFocused ? iconOn : iconOff} size={22} color={isFocused ? Brand.bg : Brand.ink} />
          )}
          {level != null && (
            <View style={styles.levelBadge}>
              <BrandText weight="bold" style={styles.levelBadgeText}>
                {level}
              </BrandText>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <Ionicons name={isFocused ? iconOn : iconOff} size={25} color={isFocused ? Brand.bg : Brand.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Floating rounded pill — `bottom` set inline (insets.bottom + 8) so it hovers
  // above the Android gesture/nav bar.
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Brand.bg,
    borderWidth: 1,
    borderColor: Brand.ink,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: Brand.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 14,
  },
  inner: {
    flexDirection: 'row',
    width: '100%',
    paddingVertical: 9,
    alignItems: 'center',
  },
  // The sliding brand-purple "button" behind the active tab.
  pill: {
    position: 'absolute',
    left: PILL_INSET,
    top: 5,
    bottom: 5,
    borderRadius: 16,
    backgroundColor: Brand.purple,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.7,
  },
  avatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  avatarWrapActive: {
    borderColor: Brand.bg,
    borderWidth: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Brand.surface,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Brand.purple,
    borderWidth: 1,
    borderColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: {
    color: '#fff',
    fontSize: 9,
    lineHeight: 12,
  },
});
