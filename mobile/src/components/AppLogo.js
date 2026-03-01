import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * AppLogo — pure React Native logo, no image assets required.
 * Drop in a real image later by replacing the <Badge> with an <Image>.
 *
 * Props:
 *   size     'large' (default) | 'small'
 *   tagline  optional string shown beneath the wordmark
 */
export default function AppLogo({ size = 'large', tagline }) {
  const large = size === 'large';

  return (
    <View style={styles.wrapper}>
      {/* Icon badge — rising bar chart inside a blue rounded square */}
      <View style={[styles.badge, large ? styles.badgeLarge : styles.badgeSmall]}>
        {/* Decorative ring */}
        <View style={[styles.ring, large ? styles.ringLarge : styles.ringSmall]} />
        {/* Rising bars */}
        <View style={styles.bars}>
          <View style={[styles.bar, large ? styles.barLarge : styles.barSmall, { height: large ? 10 : 7,  opacity: 0.35 }]} />
          <View style={[styles.bar, large ? styles.barLarge : styles.barSmall, { height: large ? 16 : 11, opacity: 0.55 }]} />
          <View style={[styles.bar, large ? styles.barLarge : styles.barSmall, { height: large ? 24 : 17, opacity: 0.78 }]} />
          <View style={[styles.bar, large ? styles.barLarge : styles.barSmall, { height: large ? 32 : 23, opacity: 1   }]} />
        </View>
        {/* Upward trend arrow */}
        <Text style={[styles.arrow, large ? styles.arrowLarge : styles.arrowSmall]}>↗</Text>
      </View>

      {/* Wordmark */}
      <Text style={[styles.wordmark, large ? styles.wordmarkLarge : styles.wordmarkSmall]}>
        <Text style={styles.wordDark}>Wealth</Text>
        <Text style={styles.wordBlue}>Manager</Text>
      </Text>

      {/* Optional tagline */}
      {!!tagline && (
        <Text style={[styles.tagline, large ? styles.taglineLarge : styles.taglineSmall]}>
          {tagline}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },

  // Badge
  badge: {
    backgroundColor: '#1d4ed8',
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  badgeLarge: { width: 80, height: 80, borderRadius: 22, marginBottom: 16, padding: 12 },
  badgeSmall: { width: 48, height: 48, borderRadius: 14, marginBottom: 10, padding: 7 },

  // Subtle inner ring for depth
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
  },
  ringLarge: { width: 96, height: 96, top: -20, right: -20 },
  ringSmall: { width: 58, height: 58, top: -12, right: -12 },

  // Rising bars
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    zIndex: 1,
  },
  bar: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  barLarge: { width: 7 },
  barSmall: { width: 5 },

  // Trend arrow — top-right of badge
  arrow: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
  },
  arrowLarge: { fontSize: 15, top: 8, right: 10 },
  arrowSmall: { fontSize: 10, top: 5, right: 6 },

  // Wordmark
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  wordmarkLarge: { fontSize: 30, marginBottom: 6 },
  wordmarkSmall: { fontSize: 18, marginBottom: 4 },
  wordDark: { color: '#111827' },
  wordBlue: { color: '#2563eb' },

  // Tagline
  tagline: {
    color: '#6b7280',
    textAlign: 'center',
  },
  taglineLarge: { fontSize: 14, lineHeight: 20 },
  taglineSmall: { fontSize: 11 },
});
