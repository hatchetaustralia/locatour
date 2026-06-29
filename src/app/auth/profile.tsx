import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
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

import { BrandText, StampButton } from '@/components/brand';
import { AvatarPicker } from '@/components/avatar-picker';
import { Brand, BrandFonts, BrandRadius, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { AVATAR_CATALOG } from '@/utils/avatar';
import { checkUsernameAvailable, UsernameStatus } from '@/utils/account';

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

  // The provider avatar (preferred from route params, else the signed-in Google
  // account's stored picture — see the mount effect below).
  const [providerAvatar, setProviderAvatar] = useState<string | null>(params.avatarUrl || null);

  const [avatar, setAvatar] = useState<string | null>(params.avatarUrl || null);
  // The signed-in user's level gates the exclusive presets. A returning Google
  // user re-running onboarding keeps their level; a brand-new account is level 1.
  const [level, setLevel] = useState(1);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [displayName, setDisplayName] = useState(params.displayName || '');
  const [username, setUsername] = useState(suggestedUsername);
  const [bio, setBio] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus | 'checking' | null>(null);
  // The signed-in account (if any), captured on mount. Used to (a) exclude the
  // user's OWN handle from the "is this username taken?" check, and (b) PRESERVE
  // their real server identity/stats instead of minting a throwaway local mock.
  const currentUserRef = useRef<Awaited<ReturnType<typeof storage.getUser>>>(null);

  // When reached from the walkthrough there are no route params, but the signed-in
  // Google user already has a name + picture on their account. Seed the empty
  // fields from the stored profile so the display name is pre-filled and the
  // Google picture shows selected by default (instead of a blank placeholder).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await storage.getUser();
      if (cancelled || !user) return;
      currentUserRef.current = user;
      if (!params.displayName && user.displayName) {
        setDisplayName((prev) => prev || user.displayName);
      }
      // Seed the handle from the signed-in account so a returning user sees their
      // OWN username (and the availability check excludes it) rather than a blank.
      if (!suggestedUsername && user.username) {
        setUsername((prev) => prev || user.username.replace(/^@/, ''));
      }
      // Prefer the separately-stored Google photo as the provider option; fall
      // back to the current avatarUrl for accounts saved before that field.
      const stored = user.providerAvatarUrl || user.avatarUrl;
      if (!params.avatarUrl && stored) {
        setProviderAvatar((prev) => prev ?? stored);
        setAvatar((prev) => prev ?? user.avatarUrl);
      }
      if (user.stats?.currentLevel) setLevel(user.stats.currentLevel);
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount; params are stable for a given navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUsernameChange = (text: string) => {
    // Strip special characters and spaces, keep lowercase.
    const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
    setUsername(cleaned);
    if (usernameError) setUsernameError('');
  };

  // Debounced live availability check — username is the unique public handle.
  const usernameReqId = useRef(0);
  useEffect(() => {
    const u = username.trim();
    if (u.length < 3) {
      setUsernameStatus(u.length === 0 ? null : 'too_short');
      return;
    }
    setUsernameStatus('checking');
    const reqId = ++usernameReqId.current;
    const handle = setTimeout(async () => {
      const status = await checkUsernameAvailable(u, currentUserRef.current?.uid);
      if (reqId !== usernameReqId.current) return; // a newer keystroke won
      setUsernameStatus(status);
    }, 400);
    return () => clearTimeout(handle);
  }, [username]);

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
    } else if (usernameStatus === 'taken') {
      setUsernameError('That username is taken');
      isValid = false;
    } else {
      setUsernameError('');
    }

    if (!isValid) return;

    const fullUsername = username.startsWith('@') ? username : `@${username}`;

    // Preserve the signed-in account's real identity (uid/device_id, stats, home
    // base, etc.) and only update the editable profile fields. A returning SSO
    // user must NOT be replaced by a throwaway local mock — that severs the server
    // link and resets their progress. Fall back to a fresh local profile only when
    // there's genuinely no signed-in account (legacy/mock OTP path).
    const existing = currentUserRef.current ?? (await storage.getUser());
    if (existing) {
      await storage.setUser({
        ...existing,
        displayName: displayName.trim(),
        username: fullUsername,
        bio: bio.trim(),
        avatarUrl: avatar || providerAvatar || existing.avatarUrl || AVATAR_CATALOG[0].url,
      });
    } else {
      await storage.setUser({
        uid: 'user_' + Math.random().toString(36).slice(2, 11),
        displayName: displayName.trim(),
        username: fullUsername,
        bio: bio.trim(),
        avatarUrl: avatar || providerAvatar || AVATAR_CATALOG[0].url,
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
      });
    }

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
        {/* ── Header row: title ── */}
        <View style={styles.header}>
          <BrandText weight="semibold" style={styles.pageTitle}>
            Create your profile
          </BrandText>
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
                Purple pill "Change avatar" — opens the slide-up AvatarPicker.
                StampButton has no purple variant; compose locally so we can
                control pill radius and background independently.
              */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setAvatarPickerVisible(true)}
                style={styles.selectImageBtn}
              >
                <BrandText weight="semibold" color={Brand.bg} style={styles.selectImageLabel}>
                  Change avatar
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
                cursorColor={Brand.ink}
                selectionColor={Brand.ink}
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
              {usernameStatus === 'checking' ? (
                <ActivityIndicator size="small" color={Brand.inkSubtle} />
              ) : usernameStatus === 'available' ? (
                <Ionicons name="checkmark-circle" size={18} color={Brand.sticker.green} />
              ) : usernameStatus === 'taken' ? (
                <Ionicons name="close-circle" size={18} color="#d1453b" />
              ) : null}
            </View>
            {usernameError ? (
              <BrandText weight="medium" style={styles.errorText}>{usernameError}</BrandText>
            ) : usernameStatus === 'available' ? (
              <BrandText weight="medium" style={styles.availableText}>Nice — that one&apos;s free</BrandText>
            ) : usernameStatus === 'taken' ? (
              <BrandText weight="medium" style={styles.errorText}>That username is taken</BrandText>
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

      <AvatarPicker
        visible={avatarPickerVisible}
        currentAvatar={avatar}
        providerAvatarUrl={providerAvatar}
        currentLevel={level}
        onSelect={setAvatar}
        onClose={() => setAvatarPickerVisible(false)}
      />
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
  availableText: {
    color: Brand.sticker.green,
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
    // Match StampInput: without these Android adds font padding and top-aligns
    // the text inside the 40px row, clipping it out of view so only the cursor
    // shows. Keep the typed text readable and vertically centred.
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
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
