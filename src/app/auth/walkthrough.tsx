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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandText, StampButton } from '@/components/brand';
import { Brand, Spacing, stampBorder } from '@/constants/theme';

const { width } = Dimensions.get('window');

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tilt: number; // a little hand-stamped rotation for character
  title: string;
  body: string;
};

// The up-front story (spec 08). Runs BEFORE account creation — a quick, fun tour
// of what Locatour is, told as an explorer's journey rather than a rules list.
// Each step is a passport-stamp badge (brand stamp border + a clean icon), no
// other game's name — the voice is our own.
const SLIDES: Slide[] = [
  {
    icon: 'compass',
    color: Brand.purple,
    tilt: -6,
    title: "There's more out there",
    body: 'Beaches, lookouts, lakes and quiet little spots are closer than you think. Most people walk straight past them. Locatour puts them all on one map so you can go find them.',
  },
  {
    icon: 'camera',
    color: Brand.sticker.gold,
    tilt: 5,
    title: 'Been there? Stamp it.',
    body: 'Get to a place for real, snap a photo, and stamp your passport. Every stamp earns XP and moves you up the ranks. Go out a few days in a row and your streak keeps growing.',
  },
  {
    icon: 'ribbon',
    color: Brand.sticker.green,
    tilt: -4,
    title: 'Earn your way in',
    body: 'The big, popular spots are open to everyone. The rarer ones stay locked until you rank up, and you rank up by getting outside. Keep exploring and more of the map opens to you.',
  },
  {
    icon: 'sparkles',
    color: Brand.sticker.pink,
    tilt: 6,
    title: 'Find the hidden ones',
    body: "Some places stay hidden until you walk right into one. Find a hidden gem and you get a one-time bonus, real bragging rights, and a heads up from us when you're near another.",
  },
];

export default function WalkthroughScreen() {
  const router = useRouter();
  // `?help=1` means the tour was re-opened from inside the app (Profile help
  // button), so finishing should return to where we came from — NOT the login /
  // onboarding flow.
  const { help } = useLocalSearchParams<{ help?: string }>();
  const isHelp = help === '1';
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  // The story now runs AFTER sign-in for new users, so finishing it drops them
  // into the app. When re-opened as help (from profile), just pop back.
  const finish = () => {
    if (isHelp) {
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
      return;
    }
    router.replace('/explore');
  };

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
            {/* Passport-stamp badge: stamp border + an inner rubber-stamp ring. */}
            <View style={[styles.stamp, stampBorder, { backgroundColor: item.color, transform: [{ rotate: `${item.tilt}deg` }] }]}>
              <View style={styles.stampInner}>
                <Ionicons name={item.icon} size={54} color={Brand.bg} />
              </View>
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
  // Passport-stamp badge
  stamp: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  stampInner: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: 'rgba(252,240,232,0.6)',
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
