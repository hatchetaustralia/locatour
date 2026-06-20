import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets, BrandText, Sticker, StampButton } from '@/components/brand';
import { Brand, stampBorder, BrandFonts } from '@/constants/theme';

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email || 'your email';

  const { width } = useWindowDimensions();
  const colWidth = Math.min(300, width - 48);

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(59);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const inputRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  // Resend code countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleOtpChange = (text: string, index: number) => {
    // Only accept numeric entries
    const cleanText = text.replace(/[^0-9]/g, '');
    const newOtp = [...otp];
    newOtp[index] = cleanText;
    setOtp(newOtp);

    if (error) setError('');

    // Shift focus forward if text is entered
    if (cleanText && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // If backspace is pressed on empty input, focus previous input
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleVerify = () => {
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    // Mock verification delay
    setTimeout(() => {
      setIsVerifying(false);
      // Assume "123456" is the debug code, but allow any code for easy dev sandbox
      router.push('/auth/profile');
    }, 1200);
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    setResendTimer(59);
    setOtp(['', '', '', '', '', '']);
    inputRefs[0].current?.focus();
    setError('');
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Passport-stamp stickers clustered across the top — same positions as
          login.tsx for visual consistency across the auth flow. */}
      <View pointerEvents="none" style={styles.stickerLayer}>
        <Sticker kind="camera" size={146} style={[styles.sticker, { top: -6, left: -34 }]} />
        <Sticker kind="hiking" size={92} style={[styles.sticker, { top: 30, left: 78 }]} />
        <Sticker kind="hat" size={158} style={[styles.sticker, { top: -18, left: 226 }]} />
        <Sticker kind="boot" size={96} style={[styles.sticker, { top: 34, left: 312 }]} />
      </View>

      <View style={[styles.column, { width: colWidth }]}>
        {/* Logo */}
        <Image source={BrandAssets.logo} style={styles.logo} resizeMode="contain" />

        {/* Heading block */}
        <View style={styles.heading}>
          <BrandText weight="semibold" style={styles.title}>
            Check your email
          </BrandText>
          <BrandText weight="semibold" style={styles.emailText}>
            {email}
          </BrandText>
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.body}>
            You will receive an email with a One Time Password (OTP). Enter that below.
          </BrandText>
        </View>

        {/* OTP boxes: 3 + dash + 3 */}
        <View style={styles.otpRow}>
          {otp.slice(0, 3).map((digit, index) => (
            <TextInput
              key={index}
              ref={inputRefs[index]}
              style={[
                styles.otpBox,
                stampBorder,
                error ? styles.otpBoxError : null,
              ]}
              keyboardType="number-pad"
              maxLength={1}
              value={digit}
              onChangeText={(text) => handleOtpChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              selectTextOnFocus
            />
          ))}

          <View style={styles.otpDash} />

          {otp.slice(3).map((digit, i) => {
            const index = i + 3;
            return (
              <TextInput
                key={index}
                ref={inputRefs[index]}
                style={[
                  styles.otpBox,
                  stampBorder,
                  error ? styles.otpBoxError : null,
                ]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(text) => handleOtpChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                selectTextOnFocus
              />
            );
          })}
        </View>

        {error ? (
          <BrandText weight="medium" style={styles.errorText}>
            {error}
          </BrandText>
        ) : null}

        {/* Continue button */}
        <StampButton
          variant="primary"
          label={isVerifying ? 'VERIFYING…' : 'CONTINUE'}
          loading={isVerifying}
          onPress={handleVerify}
          style={styles.continueButton}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.footerText}>
            Emails may take up to 5 minutes to arrive.
          </BrandText>
          <BrandText weight="medium" color={Brand.inkSecondary} style={styles.footerText}>
            {resendTimer > 0
              ? `Resend available in ${resendTimer}s`
              : (
                <>
                  {'If you did not receive an email, '}
                  <BrandText
                    weight="semibold"
                    color={Brand.purple}
                    onPress={handleResend}
                  >
                    click here{' '}
                  </BrandText>
                  to request a OTP
                </>
              )}
          </BrandText>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerLayer: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    height: 150,
  },
  sticker: {
    position: 'absolute',
  },
  column: {
    alignItems: 'center',
    gap: 28,
  },
  logo: {
    width: 179,
    height: 35,
  },
  heading: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    color: Brand.ink,
  },
  emailText: {
    fontSize: 16,
    color: '#EA739C',
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: '100%',
  },
  otpBox: {
    width: 40,
    height: 54,
    minWidth: 0,
    backgroundColor: Brand.surface,
    textAlign: 'center',
    fontFamily: BrandFonts.semibold,
    fontSize: 20,
    color: Brand.ink,
  },
  otpBoxError: {
    borderColor: '#d1453b',
  },
  otpDash: {
    width: 15,
    height: 1,
    backgroundColor: Brand.inkSubtle,
  },
  errorText: {
    color: '#d1453b',
    fontSize: 13,
    textAlign: 'center',
  },
  continueButton: {
    width: '100%',
  },
  footer: {
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
