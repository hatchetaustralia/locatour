/**
 * DateOfBirthInput — a native date-of-birth picker for the sign-up flow.
 *
 * Backed by @react-native-community/datetimepicker (the Expo-SDK-55 supported
 * picker). It presents a single stamp-bordered control showing the chosen date;
 * tapping it opens the OS day/month/year selector — an imperative dialog on
 * Android, an inline spinner panel on iOS. The picker is capped at today and
 * defaults to a reasonable birth year so users land near a plausible value
 * instead of "today".
 *
 * The public API is intentionally stable — `DateParts`, `partsToIsoDate`, and
 * the `DateOfBirthInput` component are consumed by both onboarding
 * (auth/customize) and the profile editor. `partsToIsoDate(value)` still
 * reports a valid ISO `YYYY-MM-DD` string only when the parts form a real past
 * calendar date, and `null` otherwise, so callers can gate submission and run
 * their own age check exactly as before.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { BrandText } from '@/components/brand';
import { Brand, stampBorder } from '@/constants/theme';

export type DateParts = { day: string; month: string; year: string };

/** Default year the picker opens on when no date is set yet (~25 years old). */
const DEFAULT_BIRTH_YEAR = new Date().getFullYear() - 25;

/**
 * Validate a day/month/year trio against the calendar. Returns the ISO
 * `YYYY-MM-DD` string for a real date that is strictly in the past, else null.
 */
export function partsToIsoDate(parts: DateParts): string | null {
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  if (parts.year.length !== 4) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Round-trip through Date to reject impossible days (e.g. 31 Feb, 30 Feb).
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  // Must be in the past (backend rule: before:today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (candidate >= today) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** DateParts → a JS Date for seeding the picker, or null if not a real date. */
function partsToDate(parts: DateParts): Date | null {
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  if (!parts.day || !parts.month || parts.year.length !== 4) return null;
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
}

/** JS Date → DateParts in the zero-padded shape the rest of the form expects. */
function dateToParts(date: Date): DateParts {
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  };
}

/** Human-friendly label for the chosen date, e.g. "7 March 2001". */
function formatLabel(parts: DateParts): string | null {
  const date = partsToDate(parts);
  if (!date) return null;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DateOfBirthInput({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (next: DateParts) => void;
}) {
  // iOS shows an inline spinner panel toggled by this flag; Android opens the
  // OS dialog imperatively and never renders the component inline.
  const [showIosPicker, setShowIosPicker] = useState(false);

  const maxDate = new Date();
  const seedDate =
    partsToDate(value) ?? new Date(DEFAULT_BIRTH_YEAR, 0, 1);

  const commit = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) {
      onChange(dateToParts(date));
    }
  };

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: seedDate,
        mode: 'date',
        display: 'calendar',
        maximumDate: maxDate,
        onChange: (event, date) => {
          // Android dialog dismisses itself; just record a confirmed pick.
          commit(event, date);
        },
      });
    } else {
      setShowIosPicker(prev => !prev);
    }
  };

  const label = formatLabel(value);

  return (
    <View>
      <TouchableOpacity
        style={[styles.control, stampBorder]}
        activeOpacity={0.85}
        onPress={openPicker}
      >
        <BrandText
          weight="medium"
          color={label ? Brand.ink : Brand.inkSubtle}
          style={styles.controlText}
        >
          {label ?? 'Select date of birth'}
        </BrandText>
        <Ionicons name="calendar-outline" size={18} color={Brand.inkSubtle} />
      </TouchableOpacity>

      {Platform.OS === 'ios' && showIosPicker && (
        <View style={[styles.iosPanel, stampBorder]}>
          <DateTimePicker
            value={seedDate}
            mode="date"
            display="spinner"
            maximumDate={maxDate}
            onChange={(event, date) => {
              // iOS spinner fires on every wheel change; keep the value live.
              commit(event, date);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
  },
  controlText: {
    fontSize: 14,
  },
  iosPanel: {
    marginTop: 8,
    backgroundColor: Brand.surface,
  },
});
