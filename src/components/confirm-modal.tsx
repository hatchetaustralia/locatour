import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

import { BrandText } from '@/components/brand';
import { Brand, Spacing, BrandRadius, stampBorder } from '@/constants/theme';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  /** Optional lead paragraph above any bullets. */
  body?: string;
  /** Optional bullet lines (e.g. the nearby-alerts explainer). */
  bullets?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible / destructive actions (e.g. logout). */
  destructive?: boolean;
  /** Show a spinner in the confirm button + block dismissal. */
  loading?: boolean;
  /** Single-button info mode (no cancel) — e.g. a permission explainer. */
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Branded replacement for the native `Alert.alert` confirm dialog — the OS dialog
 * can't be styled, so anywhere we want the Locatour look (passport-stamp card,
 * Poppins, stamp border) we render this instead. Mirrors the check-in delete
 * confirm card so all confirmations feel the same.
 */
export function ConfirmModal({
  visible,
  title,
  body,
  bullets,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => (loading ? null : onCancel())}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, stampBorder]}>
          <BrandText weight="semibold" style={styles.title}>
            {title}
          </BrandText>

          {body ? (
            <BrandText weight="medium" color={Brand.inkSecondary} style={styles.body}>
              {body}
            </BrandText>
          ) : null}

          {bullets?.length ? (
            <View style={styles.bullets}>
              {bullets.map((line, i) => (
                <View key={i} style={styles.bulletRow}>
                  <BrandText weight="bold" color={Brand.inkSecondary} style={styles.bulletDot}>
                    •
                  </BrandText>
                  <BrandText weight="medium" color={Brand.inkSecondary} style={styles.bulletText}>
                    {line}
                  </BrandText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.buttons}>
            {!hideCancel && (
              <TouchableOpacity
                style={[styles.button, styles.cancel, stampBorder]}
                activeOpacity={0.85}
                disabled={loading}
                onPress={onCancel}
              >
                <BrandText weight="bold" color={Brand.ink} style={styles.buttonText}>
                  {cancelLabel}
                </BrandText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                destructive ? styles.confirmDanger : styles.confirmPrimary,
                stampBorder,
              ]}
              activeOpacity={0.85}
              disabled={loading}
              onPress={onConfirm}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Brand.bg} />
              ) : (
                <BrandText weight="bold" color={Brand.bg} style={styles.buttonText}>
                  {confirmLabel}
                </BrandText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Brand.surface,
    borderRadius: BrandRadius.sticker,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    color: Brand.ink,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  bullets: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  button: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BrandRadius.control,
  },
  cancel: {
    backgroundColor: Brand.surface,
  },
  confirmPrimary: {
    backgroundColor: Brand.purple,
  },
  confirmDanger: {
    backgroundColor: Brand.sticker.pink,
  },
  buttonText: {
    fontSize: 15,
  },
});
