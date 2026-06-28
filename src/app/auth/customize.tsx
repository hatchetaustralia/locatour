import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandText, StampButton } from '@/components/brand';
import { Brand, BrandFonts, BrandRadius, stampBorder } from '@/constants/theme';
import { storage } from '@/utils/storage';
import { syncAccount } from '@/utils/account';
import { INTERESTS } from '@/constants/interests';
import { fetchSuburbs, fetchPlaceCoordinates, SuburbSuggestion } from '@/utils/places';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const GENDERS = ['Male', 'Female', 'Prefer not to say'];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function CustomizeScreen() {
  const router = useRouter();

  const [gender, setGender] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [suburbQuery, setSuburbQuery] = useState('');
  const [selectedSuburb, setSelectedSuburb] = useState('');
  // placeId of the picked suggestion → lets us resolve precise base coordinates.
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [showSuburbs, setShowSuburbs] = useState(false);
  const [suburbSuggestions, setSuburbSuggestions] = useState<SuburbSuggestion[]>([]);
  const [suburbLoading, setSuburbLoading] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Live suburb autocomplete via the backend Google Places proxy. Debounced so
  // we don't fire a request on every keystroke; the last query wins.
  const suburbReqId = useRef(0);
  useEffect(() => {
    const q = suburbQuery.trim();
    // Don't re-search the exact value the user just picked.
    if (!q || q === selectedSuburb) {
      setSuburbSuggestions([]);
      setSuburbLoading(false);
      return;
    }
    setSuburbLoading(true);
    const reqId = ++suburbReqId.current;
    const handle = setTimeout(async () => {
      const results = await fetchSuburbs(q);
      // Ignore stale responses (a newer keystroke superseded this one).
      if (reqId !== suburbReqId.current) return;
      setSuburbSuggestions(results);
      setSuburbLoading(false);
    }, 320);
    return () => clearTimeout(handle);
  }, [suburbQuery, selectedSuburb]);

  const handleSuburbSelect = (suburb: string, placeId?: string) => {
    setSelectedSuburb(suburb);
    setSelectedPlaceId(placeId ?? '');
    setSuburbQuery(suburb);
    setShowSuburbs(false);
    setSuburbSuggestions([]);
  };

  const handleInterestToggle = (id: string) => {
    setError('');
    if (selectedInterests.includes(id)) {
      setSelectedInterests(prev => prev.filter(item => item !== id));
    } else {
      if (selectedInterests.length >= 3) {
        setError('You can select a maximum of 3 interests');
        return;
      }
      setSelectedInterests(prev => [...prev, id]);
    }
  };

  const handleComplete = async () => {
    // Accept either a picked suggestion or whatever the user typed, so a flaky
    // Places lookup never hard-blocks onboarding.
    const suburb = (selectedSuburb || suburbQuery).trim();

    if (!suburb) {
      setError('Please enter your home suburb');
      return;
    }
    if (selectedInterests.length === 0) {
      setError('Please select at least 1 interest category');
      return;
    }

    if (!agreedToTerms) {
      setError('Please agree to the Terms and Conditions to continue');
      return;
    }

    // Resolve the base suburb to coordinates so the map can warm-start at the
    // user's home instead of a default city centre (fail-soft — onboarding must
    // never block on a geocode; backfill on next launch covers a miss here).
    let homeCoordinates;
    try {
      const coords = await fetchPlaceCoordinates({
        placeId: selectedPlaceId || undefined,
        suburb,
      });
      if (coords) homeCoordinates = coords;
    } catch {
      // ignore — coords are a nice-to-have
    }

    // Save customised info
    const currentUser = await storage.getUser();
    if (currentUser) {
      currentUser.gender = gender;
      currentUser.homeSuburb = suburb;
      if (homeCoordinates) currentUser.homeCoordinates = homeCoordinates;
      currentUser.interests = selectedInterests;

      // Auto-unlock the photographer star if photo is selected
      if (selectedInterests.includes('photography')) {
        currentUser.stats.totalXP += 100; // Unlocked Achievement points
      }

      await storage.setUser(currentUser);
    } else {
      // Emergency creation
      await storage.customizeInterests(gender, suburb, selectedInterests, homeCoordinates);
    }

    // Push the onboarding profile (home base, interests, gender) to the server.
    // The backend account already exists from the Google sign-in that gated entry
    // here, so we SYNC the existing Google-owned account rather than registering a
    // new one — registering would spawn an anonymous device account. Network
    // failures stay fail-soft: onboarding still completes and the next app start
    // re-syncs.
    const finalUser = await storage.getUser();
    if (finalUser) {
      setSubmitting(true);
      await syncAccount();
      setSubmitting(false);
    }

    // Setup done — enter the app on the MAP (the game walkthrough now runs
    // up-front, before account creation).
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header row: title only ── */}
        <View style={styles.headerRow}>
          <BrandText weight="bold" style={styles.title}>
            Customise your account
          </BrandText>
        </View>

        <View style={styles.formStack}>
          {/* ── Gender dropdown ── */}
          <View style={styles.field}>
            <BrandText weight="medium" style={styles.label}>Gender</BrandText>
            <TouchableOpacity
              style={[styles.selectControl, stampBorder]}
              activeOpacity={0.85}
              onPress={() => {
                setShowGenderDropdown(v => !v);
                setShowSuburbs(false);
              }}
            >
              <BrandText
                weight="medium"
                color={gender ? Brand.ink : Brand.inkSubtle}
                style={styles.selectText}
              >
                {gender || 'Gender'}
              </BrandText>
              <Ionicons name="chevron-down" size={20} color={Brand.inkSubtle} />
            </TouchableOpacity>
            {showGenderDropdown && (
              <View style={[styles.dropdownPanel, stampBorder]}>
                {GENDERS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.dropdownItem,
                      g !== GENDERS[GENDERS.length - 1] && styles.dropdownItemBorder,
                    ]}
                    onPress={() => {
                      setGender(g);
                      setShowGenderDropdown(false);
                    }}
                  >
                    <BrandText weight="medium" style={styles.dropdownItemText}>{g}</BrandText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ── Home suburb autocomplete
                Must stay position:relative + high zIndex so the dropdown
                overlays the interests grid below (existing bug-fix preserved). ── */}
          <View style={[styles.field, styles.suburbField]}>
            <BrandText weight="medium" style={styles.label}>
              Home suburb{' '}
              <BrandText weight="medium" color="#EA739C">*</BrandText>
            </BrandText>
            <View style={styles.suburbContainer}>
              <View style={[styles.suburbInput, stampBorder]}>
                <Ionicons name="search-outline" size={18} color={Brand.inkSubtle} />
                <TextInput
                  style={styles.suburbTextInput}
                  placeholder="Suburb"
                  placeholderTextColor={Brand.inkSubtle}
                  cursorColor={Brand.ink}
                  selectionColor={Brand.ink}
                  value={suburbQuery}
                  onChangeText={text => {
                    setSuburbQuery(text);
                    setShowSuburbs(true);
                    setShowGenderDropdown(false);
                    if (selectedSuburb && text !== selectedSuburb) {
                      setSelectedSuburb('');
                      setSelectedPlaceId('');
                    }
                  }}
                  onFocus={() => {
                    setShowSuburbs(true);
                    setShowGenderDropdown(false);
                  }}
                />
              </View>

              {showSuburbs &&
                suburbQuery.trim().length >= 2 &&
                suburbQuery.trim() !== selectedSuburb && (
                  <View style={[styles.dropdownPanel, styles.suburbDropdown, stampBorder]}>
                    {suburbLoading ? (
                      <View style={styles.dropdownItem}>
                        <ActivityIndicator size="small" color={Brand.purple} />
                        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.dropdownItemText}>
                          Searching…
                        </BrandText>
                      </View>
                    ) : suburbSuggestions.length > 0 ? (
                      suburbSuggestions.map((s, i) => (
                        <TouchableOpacity
                          key={s.placeId ?? s.description}
                          style={[
                            styles.dropdownItem,
                            i !== suburbSuggestions.length - 1 && styles.dropdownItemBorder,
                          ]}
                          onPress={() => handleSuburbSelect(s.description, s.placeId)}
                        >
                          <Ionicons name="location-outline" size={16} color={Brand.purple} />
                          <BrandText weight="medium" style={styles.dropdownItemText}>
                            {s.description}
                          </BrandText>
                        </TouchableOpacity>
                      ))
                    ) : (
                      <View style={styles.dropdownItem}>
                        <Ionicons name="information-circle-outline" size={16} color={Brand.inkSubtle} />
                        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.dropdownItemText}>
                          No matches — we&apos;ll use what you typed
                        </BrandText>
                      </View>
                    )}
                  </View>
                )}
            </View>
          </View>

          {/* ── Interests grid ── */}
          <View style={styles.field}>
            <View style={styles.interestLabelRow}>
              <BrandText weight="medium" style={styles.label}>
                What are you interested in?{' '}
                <BrandText weight="medium" color="#EA739C">*</BrandText>
              </BrandText>
              <BrandText weight="medium" color={Brand.inkSubtle} style={styles.counterText}>
                {selectedInterests.length}/3
              </BrandText>
            </View>

            <View style={styles.interestGrid}>
              {INTERESTS.map(item => {
                const isSelected = selectedInterests.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.interestCard,
                      // Each card wears its category tint; selection deepens the
                      // border and lifts the card with an elevated black shadow.
                      { backgroundColor: item.color },
                      isSelected
                        ? styles.interestCardSelected
                        : styles.interestCardUnselected,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleInterestToggle(item.id)}
                  >
                    {isSelected && (
                      <View style={styles.interestCheck}>
                        <Ionicons name="checkmark" size={14} color={Brand.surface} />
                      </View>
                    )}
                    <Ionicons
                      name={item.icon}
                      size={36}
                      color={Brand.ink}
                      style={styles.interestIcon}
                    />
                    <BrandText
                      weight="semibold"
                      color={Brand.ink}
                      style={styles.interestLabel}
                    >
                      {item.name}
                    </BrandText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Error message ── */}
          {error ? (
            <BrandText weight="medium" style={styles.errorText}>{error}</BrandText>
          ) : null}

          {/* ── T&C checkbox ── */}
          <TouchableOpacity
            style={styles.checkboxRow}
            activeOpacity={0.8}
            onPress={() => setAgreedToTerms(v => !v)}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && (
                <Ionicons name="checkmark" size={12} color={Brand.surface} />
              )}
            </View>
            <BrandText weight="medium" color={Brand.inkSecondary} style={styles.checkboxLabel}>
              {'I have read and agree to the '}
              <BrandText weight="semibold" color={Brand.purple}>Terms and Conditions </BrandText>
              {'and '}
              <BrandText weight="semibold" color={Brand.purple}>Privacy Policy</BrandText>
            </BrandText>
          </TouchableOpacity>

          {/* ── Create Account button ── */}
          <StampButton
            variant="primary"
            label="CREATE ACCOUNT"
            onPress={handleComplete}
            loading={submitting}
            disabled={submitting}
            style={styles.createButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  title: {
    fontSize: 20,
    color: Brand.ink,
    flex: 1,
  },

  // Form container
  formStack: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 24,
  },

  // Generic field wrapper
  field: {
    gap: 3,
  },
  label: {
    fontSize: 14,
    color: Brand.ink,
  },

  // Gender select control (mimics StampInput but with chevron)
  selectControl: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
  },
  selectText: {
    fontSize: 14,
  },

  // Shared dropdown panel
  dropdownPanel: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: Brand.surface,
    zIndex: 200,
    shadowColor: Brand.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: `rgba(42,36,33,0.1)`,
  },
  dropdownItemText: {
    fontSize: 14,
    color: Brand.ink,
  },

  // Suburb field — must be position:relative + high zIndex so the autocomplete
  // dropdown overlays the interests grid below (existing fix preserved).
  suburbField: {
    position: 'relative',
    zIndex: 20,
  },
  suburbContainer: {
    position: 'relative',
    zIndex: 50,
  },
  suburbInput: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
  },
  suburbTextInput: {
    flex: 1,
    fontFamily: BrandFonts.medium,
    fontSize: 14,
    color: Brand.ink,
    height: '100%',
  },
  suburbDropdown: {
    // positioned absolutely via dropdownPanel base styles
    top: 44,
    zIndex: 100,
  },

  // Interest counter label
  interestLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  counterText: {
    fontSize: 12,
  },

  // Interest grid — 3-column, roughly square cards
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestCard: {
    width: '31.3%',
    height: 117,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  interestCardUnselected: {
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: `rgba(42,36,33,0.2)`,
  },
  // Selected = a solid ink border plus the elevated black shadow so the card
  // visibly lifts off the page (mirrors the dropdownPanel shadow recipe).
  interestCardSelected: {
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: Brand.ink,
    shadowColor: Brand.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  // Corner badge confirming the pick, sitting above the card's tint.
  interestCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  interestIcon: {
    marginTop: 4,
  },
  interestLabel: {
    fontSize: 13,
    textAlign: 'center',
  },

  // Error
  errorText: {
    color: '#d1453b',
    fontSize: 13,
    textAlign: 'center',
  },

  // T&C checkbox row
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkbox: {
    width: 14,
    height: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: Brand.ink,
    borderRadius: BrandRadius.control / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: Brand.ink,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: -0.14,
  },

  // Create Account CTA
  createButton: {
    width: '100%',
  },
});
