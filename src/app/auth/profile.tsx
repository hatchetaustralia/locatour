import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets, BrandText, StampButton } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';

// ---------------------------------------------------------------------------
// Avatar presets — dicebear adventurer illustrations.
// ---------------------------------------------------------------------------
const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/adventurer/png?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Aneka&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Jack&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/adventurer/png?seed=Mia&backgroundColor=d1f4c9',
];

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    provider?: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  }>();

  // Derive a suggested username from the SSO email local-part.
  const suggestedUsername = params.email
    ? params.email.split('@')[0].replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase()
    : '';

  // Surface the provider avatar as the first (pre-selected) preset.
  const presets = params.avatarUrl ? [params.avatarUrl, ...AVATAR_PRESETS] : AVATAR_PRESETS;

  const [avatar, setAvatar] = useState<string | null>(params.avatarUrl || null);
  const [displayName, setDisplayName] = useState(params.displayName || '');
  const [username, setUsername] = useState(suggestedUsername);
  const [bio, setBio] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const handleUsernameChange = (text: string) => {
    // Strip special characters and spaces, keep lowercase.
    const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
    setUsername(cleaned);
    if (usernameError) setUsernameError('');
  };

  const handleNext = async () => {
    let isValid = true;

    if (!displayName.trim()) {
      setDisplayNameError('Display name is required');
      isValid = false;
    } else {
      setDisplayNameError('');
    }

    if (!username.trim()) {
      setUsernameError('Username is required');
      isValid = false;
    } else if (username.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      isValid = false;
    } else {
      setUsernameError('');
    }

    if (!isValid) return;

    const fullUsername = username.startsWith('@') ? username : `@${username}`;

    const mockUser = {
      uid: 'user_' + Math.random().toString(36).slice(2, 11),
      displayName: displayName.trim(),
      username: fullUsername,
      bio: bio.trim(),
      avatarUrl: avatar || presets[0],
      gender: '',
      homeSuburb: '',
      interests: [],
      stats: {
        dayStreak: 0,
        totalXP: 0,
        uniqueLocations: 0,
        totalCheckIns: 0,
        currentLevel: 1,
        currentXPInLevel: 0,
        xpNeededForNextLevel: 100,
      },
      createdAt: new Date().toISOString(),
    };

    await storage.setUser(mockUser);

    // Route to Customization.
    router.push('/auth/customize');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header row: title left, logomark right ── */}
        <View style={styles.header}>
          <BrandText weight="semibold" style={styles.pageTitle}>
            Create your profile
          </BrandText>
          <Image source={BrandAssets.logo} style={styles.logomark} resizeMode="contain" />
        </View>

        {/* ── Form body ── */}
        <View style={styles.form}>

          {/* Avatar row ── circle left, label + button right */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color={Brand.inkSubtle} />
              )}
            </View>
            <View style={styles.avatarMeta}>
              <BrandText weight="medium" style={styles.avatarLabel}>
                Avatar (optional)
              </BrandText>
              {/*
                Purple pill "Select an image".
                StampButton has no purple variant; compose locally so we can
                control pill radius and background independently.
              */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  // Cycle through presets as a simple picker substitute.
                  const idx = avatar ? presets.indexOf(avatar) : -1;
                  setAvatar(presets[(idx + 1) % presets.length]);
                }}
                style={styles.selectImageBtn}
              >
                <BrandText weight="semibold" color={Brand.bg} style={styles.selectImageLabel}>
                  Select an image
                </BrandText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Display name */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>
              Display name <Text style={styles.required}>*</Text>
            </BrandText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputField}
                placeholder="Display name"
                placeholderTextColor={Brand.inkSubtle}
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  if (displayNameError) setDisplayNameError('');
                }}
                autoCorrect={false}
              />
            </View>
            {displayNameError ? (
              <BrandText weight="medium" style={styles.errorText}>{displayNameError}</BrandText>
            ) : null}
          </View>

          {/* Username ── leading @ glyph inside the stamp border */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>
              Username <Text style={styles.required}>*</Text>
            </BrandText>
            <View style={styles.inputRow}>
              <BrandText weight="medium" style={styles.atPrefix}>@</BrandText>
              <TextInput
                style={[styles.inputField, styles.inputFieldFlex]}
                placeholder="my_username"
                placeholderTextColor={Brand.inkSubtle}
                value={username}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {usernameError ? (
              <BrandText weight="medium" style={styles.errorText}>{usernameError}</BrandText>
            ) : null}
          </View>

          {/* Bio */}
          <View style={styles.fieldGroup}>
            <BrandText weight="medium" style={styles.label}>
              Bio <Text style={styles.optional}>(optional)</Text>
            </BrandText>
            <View style={[styles.inputRow, styles.bioInputRow]}>
              <TextInput
                style={[styles.inputField, styles.bioInputField]}
                placeholder="A little bit about yourself…"
                placeholderTextColor={Brand.inkSubtle}
                value={bio}
                onChangeText={(text) => text.length <= 150 && setBio(text)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            <BrandText weight="medium" style={styles.charCounter}>
              {bio.length}/150
            </BrandText>
          </View>

          {/* Continue */}
          <StampButton
            variant="primary"
            label="CONTINUE"
            onPress={handleNext}
            style={styles.continueBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 32,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  pageTitle: {
    fontSize: 20,
    color: Brand.ink,
  },
  logomark: {
    width: 38,
    height: 38,
  },

  // ── Form container ──
  form: {
    paddingHorizontal: 16,
    gap: 24,
  },

  // ── Avatar row ──
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: BrandRadius.pill,
    backgroundColor: '#FFF9F4',
    borderWidth: 1,
    borderColor: '#D6BDB6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarMeta: {
    gap: 10,
    alignItems: 'flex-start',
  },
  avatarLabel: {
    fontSize: 14,
    color: Brand.ink,
  },
  selectImageBtn: {
    ...stampBorder,
    borderRadius: BrandRadius.pill,
    backgroundColor: Brand.purple,
    height: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectImageLabel: {
    fontSize: 14,
  },

  // ── Field groups ──
  fieldGroup: {
    gap: 3,
  },
  label: {
    fontSize: 14,
    color: Brand.ink,
  },
  required: {
    color: '#EA739C',
    fontFamily: BrandFonts.medium,
    fontSize: 14,
  },
  optional: {
    color: Brand.inkSubtle,
    fontFamily: BrandFonts.medium,
    fontSize: 14,
  },
  errorText: {
    color: '#d1453b',
    fontSize: 12,
    marginTop: 2,
  },

  // ── Input row (stamp border wrapper) ──
  inputRow: {
    ...stampBorder,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
    gap: 6,
  },
  inputField: {
    fontFamily: BrandFonts.medium,
    fontSize: 14,
    color: Brand.ink,
    height: '100%',
    flex: 1,
  },
  inputFieldFlex: {
    // Already flex:1 in inputField; kept for clarity when used alongside atPrefix.
  },
  atPrefix: {
    fontSize: 14,
    color: Brand.inkSubtle,
    lineHeight: 20,
  },

  // ── Bio ──
  bioInputRow: {
    height: 100,
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
  },
  bioInputField: {
    height: undefined,
    flex: 1,
    alignSelf: 'stretch',
    textAlignVertical: 'top',
  },
  charCounter: {
    fontSize: 12,
    color: Brand.ink,
    marginTop: 2,
  },

  // ── Continue ──
  continueBtn: {
    width: '100%',
    marginTop: 8,
  },
});
