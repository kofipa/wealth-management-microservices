import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AppLogo from '../components/AppLogo';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'welcome',
    emoji: null, // uses AppLogo
    title: 'Track everything\nin one place',
    body: 'Your complete financial picture — assets, liabilities, documents and net worth — always at your fingertips.',
  },
  {
    key: 'assets',
    emoji: '💰',
    title: 'Add your assets',
    body: 'Cash savings, investments, properties and vehicles. Connect your bank with Open Banking for automatic updates.',
  },
  {
    key: 'legacy',
    emoji: '🛡️',
    title: 'Protect your legacy',
    body: 'Store important documents, add trusted contacts, and explore financial services tailored to your situation.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  const finish = async () => {
    await SecureStore.setItemAsync('onboardingDone', '1');
    navigation.replace('MainTabs');
  };

  const next = () => {
    if (activeIndex < SLIDES.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else {
      finish();
    }
  };

  const slide = SLIDES[activeIndex];
  const isLast = activeIndex === SLIDES.length - 1;
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={finish}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.slideContent}>
        {slide.emoji === null ? (
          <View style={styles.logoWrap}>
            <AppLogo size="large" />
          </View>
        ) : (
          <Text style={styles.emoji}>{slide.emoji}</Text>
        )}
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveIndex(i)}>
            <View style={[styles.dot, i === activeIndex && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={next}>
        <Text style={styles.btnText}>{isLast ? 'Get Started' : 'Next'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 48,
    alignItems: 'center',
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  skipText: { fontSize: 15, color: colors.textTertiary },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  logoWrap: { marginBottom: 32 },
  emoji: { fontSize: 72, marginBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
