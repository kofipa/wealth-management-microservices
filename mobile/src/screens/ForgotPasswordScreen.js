import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { forgotPassword, resetPassword, getSecurityQuestion, verifySecurityQuestion } from '../api/client';
import { useTheme } from '../context/ThemeContext';

// step: 1=email, 'sq'=security question, 2=code+new password
export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Security question state
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [sqAnswer, setSqAnswer] = useState('');

  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setStep(2);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Could not send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleUseSecurityQuestion = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }
    setLoading(true);
    try {
      const res = await getSecurityQuestion(email.trim().toLowerCase());
      setSecurityQuestion(res.data.security_question);
      setSqAnswer('');
      setStep('sq');
    } catch (err) {
      const msg = err.response?.data?.error;
      if (err.response?.status === 404) {
        Alert.alert('No Security Question', msg || 'No security question has been set for this account.');
      } else {
        Alert.alert('Error', msg || 'Could not retrieve security question');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAnswer = async () => {
    if (!sqAnswer.trim()) {
      Alert.alert('Error', 'Please enter your answer');
      return;
    }
    setLoading(true);
    try {
      await verifySecurityQuestion(email.trim().toLowerCase(), sqAnswer.trim());
      Alert.alert('Verified', 'Identity verified. A reset code has been sent to your email.');
      setStep(2);
    } catch (err) {
      if (err.response?.status === 401) {
        Alert.alert('Incorrect Answer', 'The answer you entered does not match. Please try again.');
      } else {
        Alert.alert('Error', err.response?.data?.error || 'Could not verify answer');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim() || !newPassword) {
      Alert.alert('Error', 'Please enter the reset code and a new password');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      Alert.alert('Success', 'Your password has been reset. Please log in.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const getSubtitle = () => {
    if (step === 1) return "Enter your email and we'll send you a reset code.";
    if (step === 'sq') return 'Answer your security question to verify your identity.';
    return 'Enter the 6-digit code from your email and choose a new password.';
  };

  const styles = makeStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        {/* Email field — always shown but disabled after step 1 */}
        <TextInput
          style={[styles.input, step !== 1 && styles.inputDisabled]}
          placeholder="Email"
          placeholderTextColor={colors.placeholder}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={step === 1}
        />

        {/* Step 1: Email reset button + security question link */}
        {step === 1 && (
          <>
            <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Send Code</Text>
              }
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.outlineButton} onPress={handleUseSecurityQuestion} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={styles.outlineButtonText}>Use Security Question</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* Step sq: Security question + answer */}
        {step === 'sq' && (
          <>
            <View style={styles.questionBox}>
              <Text style={styles.questionLabel}>Your security question:</Text>
              <Text style={styles.questionText}>{securityQuestion}</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Your answer"
              placeholderTextColor={colors.placeholder}
              value={sqAnswer}
              onChangeText={setSqAnswer}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity style={styles.button} onPress={handleVerifyAnswer} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Verify Answer</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep(1)} style={{ marginBottom: 12 }}>
              <Text style={styles.link}>Back to email reset</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Step 2: Code + new password */}
        {step === 2 && (
          <>
            <TextInput
              style={styles.input}
              placeholder="6-digit reset code"
              placeholderTextColor={colors.placeholder}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="New password (min 8 characters)"
              placeholderTextColor={colors.placeholder}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.button} onPress={handleResetPassword} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Reset Password</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setStep(1); setCode(''); }} style={{ marginBottom: 12 }}>
              <Text style={styles.link}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Back to <Text style={styles.linkBold}>Sign In</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  title: { fontSize: 32, fontWeight: '700', color: colors.text, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 32, textAlign: 'center', lineHeight: 22 },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    color: colors.text,
  },
  inputDisabled: { backgroundColor: colors.surfaceAlt, color: colors.textSecondary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  outlineButtonText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 12, fontSize: 14, color: colors.textTertiary },
  questionBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  questionLabel: { fontSize: 12, color: colors.primary, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  questionText: { fontSize: 16, color: colors.text, fontWeight: '500', lineHeight: 22 },
  link: { textAlign: 'center', color: colors.textSecondary, fontSize: 15, marginBottom: 8 },
  linkBold: { color: colors.primary, fontWeight: '600' },
});
