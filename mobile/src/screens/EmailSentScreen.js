import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { resendVerification } from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function EmailSentScreen({ route, navigation }) {
  const { email } = route.params || {};
  const { colors } = useTheme();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      setResent(true);
    } catch (err) {
      Alert.alert('Error', 'Could not resend the email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>✉️</Text>
      <Text style={styles.heading}>Check your inbox</Text>
      <Text style={styles.body}>
        We sent a verification link to{'\n'}
        <Text style={styles.email}>{email}</Text>
      </Text>
      <Text style={styles.sub}>
        Click the link in the email to activate your account. It expires in 24 hours.
      </Text>

      {resent ? (
        <Text style={styles.resentMsg}>Email resent! Check your inbox.</Text>
      ) : (
        <TouchableOpacity
          style={styles.resendBtn}
          onPress={handleResend}
          disabled={resending}
        >
          {resending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.resendText}>Resend verification email</Text>
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginLink}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: { fontSize: 64, marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 8, lineHeight: 24 },
  email: { fontWeight: '600', color: colors.text },
  sub: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  resendBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 20,
    minWidth: 220,
    alignItems: 'center',
  },
  resendText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  resentMsg: { color: colors.success, fontSize: 15, fontWeight: '600', marginBottom: 20 },
  loginLink: { color: colors.textSecondary, fontSize: 15, textDecorationLine: 'underline' },
});
