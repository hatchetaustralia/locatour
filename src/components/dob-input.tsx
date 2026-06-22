/**
 * DateOfBirthInput — a simple Day / Month / Year entry for the sign-up flow.
 *
 * No native date-picker dependency is installed (adding one would force a native
 * rebuild), so this is three numeric fields styled with the brand stamp border,
 * matching the rest of the auth forms. It reports a valid ISO `YYYY-MM-DD` string
 * to the parent only when all three parts form a real past calendar date, and
 * `null` otherwise, so the parent can gate submission and run its own age check.
 */
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BrandText } from '@/components/brand';
import { Brand, BrandFonts, stampBorder } from '@/constants/theme';

export type DateParts = { day: string; month: string; year: string };

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

export function DateOfBirthInput({
  value,
  onChange,
}: {
  value: DateParts;
  onChange: (next: DateParts) => void;
}) {
  const setPart = (key: keyof DateParts, raw: string, maxLen: number) => {
    const cleaned = raw.replace(/[^0-9]/g, '').slice(0, maxLen);
    onChange({ ...value, [key]: cleaned });
  };

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextInput
          style={[styles.input, stampBorder]}
          placeholder="DD"
          placeholderTextColor={Brand.inkSubtle}
          keyboardType="number-pad"
          maxLength={2}
          value={value.day}
          onChangeText={text => setPart('day', text, 2)}
        />
        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.cap}>Day</BrandText>
      </View>
      <View style={styles.field}>
        <TextInput
          style={[styles.input, stampBorder]}
          placeholder="MM"
          placeholderTextColor={Brand.inkSubtle}
          keyboardType="number-pad"
          maxLength={2}
          value={value.month}
          onChangeText={text => setPart('month', text, 2)}
        />
        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.cap}>Month</BrandText>
      </View>
      <View style={[styles.field, styles.yearField]}>
        <TextInput
          style={[styles.input, stampBorder]}
          placeholder="YYYY"
          placeholderTextColor={Brand.inkSubtle}
          keyboardType="number-pad"
          maxLength={4}
          value={value.year}
          onChangeText={text => setPart('year', text, 4)}
        />
        <BrandText weight="medium" color={Brand.inkSubtle} style={styles.cap}>Year</BrandText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  field: {
    flex: 1,
    gap: 4,
  },
  yearField: {
    flex: 1.4,
  },
  input: {
    height: 40,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Brand.surface,
    fontFamily: BrandFonts.medium,
    fontSize: 14,
    color: Brand.ink,
    textAlign: 'center',
  },
  cap: {
    fontSize: 12,
    textAlign: 'center',
  },
});
