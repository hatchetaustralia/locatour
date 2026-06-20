import React, { useRef, useState } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandText, StampButton } from '@/components/brand';
import { Brand, Spacing, BrandRadius, stampBorder } from '@/constants/theme';

const { width } = Dimensions.get('window');

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  body: string;
};

// The onboarding walkthrough: the game rules, the multiplier, hidden hunting,
// and notifications (spec 08). Shown once, at the end of onboarding.
const SLIDES: Slide[] = [
  {
    icon: 'compass',
    color: Brand.purple,
    title: 'Explore the real world',
    body: 'Locatour turns public places — parks, lookouts, beaches, hidden gems — into a game. Travel there in real life, snap a check-in, and earn XP.',
  },
  {
    icon: 'trophy',
    color: Brand.sticker.gold,
    title: 'Check in & level up',
    body: 'Every check-in earns XP and levels you up, RuneScape-style. You can re-check the same spot once every 24 hours — so keep discovering new ones.',
  },
  {
    icon: 'layers',
    color: Brand.teal,
    title: 'Tiers unlock as you level',
    body: 'Every spot has a tier (1–10). Big, well-serviced places are low-tier and open to all. Fragile or special places are high-tier — protected behind your level so only dedicated explorers reach them.',
  },
  {
    icon: 'sparkles',
    color: Brand.sticker.pink,
    title: 'Hunt hidden spots 🌈',
    body: "Spots up to 3 tiers above you are HIDDEN — they won't appear on your map. But stumble onto one in the real world and you DISCOVER it: a rainbow check-in plus a one-time 3× XP bonus. Spots far beyond your level stay secret.",
  },
  {
    icon: 'notifications',
    color: Brand.sticker.green,
    title: 'Get the nudge',
    body: "Switch on notifications and we'll ping you when you're near a spot to check in — or quietly hint that you're “closing in on something” 🔍 when a hidden gem is nearby.",
  },
];

export default function WalkthroughScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const finish = () => router.replace('/');

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToOffset({ offset: (index + 1) * width, animated: true });
  };

  const last = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={finish} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BrandText weight="semibold" color={Brand.inkSecondary} style={styles.skip}>
            Skip
          </BrandText>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_item, i) => String(i)}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconBubble, stampBorder, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} size={56} color={Brand.bg} />
            </View>
            <BrandText weight="bold" style={styles.title}>
              {item.title}
            </BrandText>
            <BrandText weight="medium" color={Brand.inkSecondary} style={styles.body}>
              {item.body}
            </BrandText>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_slide, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <StampButton variant="primary" label={last ? "LET'S GO" : 'NEXT'} onPress={next} style={styles.cta} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    height: 44,
    alignItems: 'center',
  },
  skip: {
    fontSize: 15,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.four,
  },
  iconBubble: {
    width: 120,
    height: 120,
    borderRadius: BrandRadius.sticker,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    color: Brand.ink,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.three,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.inkSubtle,
  },
  dotActive: {
    backgroundColor: Brand.purple,
    width: 22,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  cta: {
    width: '100%',
  },
});
