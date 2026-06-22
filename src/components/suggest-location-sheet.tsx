/**
 * SuggestLocationSheet — the community "Suggest a location" sheet (backlog #2).
 *
 * A user standing at a real place that ISN'T yet on Locatour can suggest it: they
 * tap a Google POI or long-press an arbitrary spot on the explore map, this sheet
 * opens on the picked coordinates, they confirm a name (+ optional notes), and
 * submit. The submitter must be near the spot — the parent runs a client-side
 * proximity pre-check and the server re-checks within 150m (returning a 422 the
 * parent surfaces via `errorMessage`).
 *
 * Presentational: the parent (explore.tsx) owns the GPS read, the distance gate,
 * and the submitSuggestion() call. This sheet manages only the name/notes inputs
 * and renders the status the parent passes down.
 */
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BrandText, StampButton, StampInput } from '@/components/brand';
import { Brand, Spacing, stampBorder, BrandRadius } from '@/constants/theme';
import { Coordinates } from '@/types';

export function SuggestLocationSheet({
  visible,
  coordinate,
  prefilledName,
  submitting,
  submitted,
  errorMessage,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** The picked point (POI tap or long-press). Null while the sheet is closed. */
  coordinate: Coordinates | null;
  /** POI name to seed the editable name field; empty for an arbitrary long-press. */
  prefilledName?: string;
  /** True while the submission is in flight (disables the button, shows a spinner). */
  submitting?: boolean;
  /** True once the server accepted the suggestion — swaps to the thank-you state. */
  submitted?: boolean;
  /** Inline error (client "get closer" pre-check OR the server's 422 message). */
  errorMessage?: string | null;
  onSubmit: (input: { name: string; notes: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Reseed the fields each time a new spot is picked (the sheet re-opens with a
  // fresh coordinate / POI name); clear them when it closes.
  useEffect(() => {
    if (visible) {
      setName(prefilledName ?? '');
      setNotes('');
    }
  }, [visible, prefilledName, coordinate?.latitude, coordinate?.longitude]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tap the dimmed area above the card to dismiss. */}
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, stampBorder]}>
          <View style={styles.grabber} />

          {submitted ? (
            // Success state — the suggestion is queued for staff review.
            <View style={styles.successWrap}>
              <View style={[styles.successIcon, stampBorder]}>
                <Ionicons name="checkmark" size={28} color={Brand.bg} />
              </View>
              <BrandText weight="bold" style={styles.successTitle}>
                Thanks! Your suggestion is pending review.
              </BrandText>
              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.successBody}>
                Our team checks new spots before they appear on the map.
              </BrandText>
              <StampButton label="Done" variant="dark" onPress={onClose} style={styles.doneBtn} />
            </View>
          ) : (
            <>
              <View style={styles.titleRow}>
                <Ionicons name="add-circle" size={22} color={Brand.purple} />
                <BrandText weight="bold" style={styles.title}>
                  Suggest a location
                </BrandText>
              </View>

              <BrandText weight="medium" color={Brand.inkSecondary} style={styles.intro}>
                Found a great spot that isn&apos;t on Locatour yet? Suggest it while you&apos;re
                standing here and we&apos;ll review it.
              </BrandText>

              {/* Picked coordinates — read-only confirmation of the chosen point. */}
              <View style={[styles.coordRow, stampBorder]}>
                <Ionicons name="location" size={16} color={Brand.purple} />
                <BrandText weight="medium" style={styles.coordText}>
                  {coordinate
                    ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
                    : 'No spot picked'}
                </BrandText>
              </View>

              <BrandText weight="medium" style={styles.label}>
                Name
              </BrandText>
              <StampInput
                icon="pricetag-outline"
                placeholder="What's this place called?"
                value={name}
                onChangeText={setName}
                autoCorrect
                style={styles.field}
              />

              <BrandText weight="medium" style={styles.label}>
                Notes (optional)
              </BrandText>
              <StampInput
                icon="create-outline"
                placeholder="Anything that helps us review it"
                value={notes}
                onChangeText={setNotes}
                multiline
                style={[styles.field, styles.notesField]}
                inputStyle={styles.notesInput}
              />

              {errorMessage ? (
                <View style={styles.errorRow}>
                  <Ionicons name="walk-outline" size={15} color={Brand.sticker.pink} />
                  <BrandText weight="medium" style={styles.errorText}>
                    {errorMessage}
                  </BrandText>
                </View>
              ) : null}

              <StampButton
                label="Suggest this spot"
                variant="primary"
                icon="send"
                loading={submitting}
                disabled={!coordinate || submitting}
                onPress={() => onSubmit({ name: name.trim(), notes: notes.trim() })}
                style={styles.submitBtn}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(42,36,33,0.35)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Brand.bg,
    borderTopLeftRadius: BrandRadius.sticker,
    borderTopRightRadius: BrandRadius.sticker,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
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
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 18,
    color: Brand.ink,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing.three,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Brand.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  coordText: {
    fontSize: 13,
    color: Brand.ink,
  },
  label: {
    fontSize: 13,
    color: Brand.ink,
    marginBottom: Spacing.one,
  },
  field: {
    marginBottom: Spacing.three,
  },
  notesField: {
    height: 76,
    alignItems: 'flex-start',
    paddingVertical: Spacing.two,
  },
  notesInput: {
    height: '100%',
    textAlignVertical: 'top',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginBottom: Spacing.three,
    marginTop: -Spacing.one,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Brand.sticker.pink,
  },
  submitBtn: {
    marginTop: Spacing.one,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.sticker.green,
    marginBottom: Spacing.three,
  },
  successTitle: {
    fontSize: 17,
    color: Brand.ink,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  successBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  doneBtn: {
    alignSelf: 'stretch',
  },
});
