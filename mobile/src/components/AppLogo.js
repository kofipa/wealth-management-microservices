import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

// Brand colours — fixed, do not change per theme
const NAVY = '#0D2040';
const TEAL = '#3DD9B8';

/**
 * CW monogram — SVG replica of the ClearWelth logo mark.
 *
 * Anatomy:
 *  • C arc  — large circular arc open on the right, navy stroke
 *  • Teal accent — small arc at the top of the C
 *  • W body — first three strokes of the W in navy
 *  • Trend arrow — final rising stroke + tip in teal (the brand accent)
 */
function CWMark({ sz, dark = false }) {
  const stroke = dark ? '#ffffff' : NAVY;
  const accent = TEAL;
  const sw = sz / 10; // stroke width scales with size

  return (
    <Svg width={sz} height={sz * 0.76} viewBox="-5 -5 90 68">
      {/* ── C arc (navy / white on dark) ─────────────────────────────── */}
      <Path
        d="M 37 20 A 20 20 0 1 0 37 40"
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* ── Teal accent — small top segment of C ─────────────────────── */}
      <Path
        d="M 20 10 A 20 20 0 0 1 37 20"
        fill="none"
        stroke={accent}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* ── W body (navy / white) ─────────────────────────────────────── */}
      <Path
        d="M 38 14 L 44 46 L 51 24 L 58 46"
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ── Trend arrow stroke (teal) ─────────────────────────────────── */}
      <Path
        d="M 58 46 L 69 10"
        fill="none"
        stroke={accent}
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
      />
      {/* ── Arrow tip (teal) ──────────────────────────────────────────── */}
      <Path
        d="M 69 10 L 71 20 M 69 10 L 62 17"
        fill="none"
        stroke={accent}
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * AppLogo — ClearWelth brand logo component.
 *
 * Props:
 *   size      'large' (default) | 'small'
 *   tagline   show "No more silent assets" when truthy (default true for large)
 *   onDark    render white version for dark backgrounds (e.g. splash)
 */
export default function AppLogo({ size = 'large', tagline, onDark = false }) {
  const { colors, isDark } = useTheme();
  const dark = onDark || isDark; // auto-adapt to dark theme or explicit override
  const large = size === 'large';
  const showTagline = tagline !== undefined ? !!tagline : large;

  const markSize  = large ? 72 : 44;
  const wordSize  = large ? 28 : 17;
  const tagSize   = large ? 13 : 10;
  const wordColor = dark ? '#ffffff' : NAVY;

  return (
    <View style={styles.wrapper}>
      {/* CW monogram */}
      <CWMark sz={markSize} dark={dark} />

      {/* Wordmark: Clear + Welth */}
      <View style={styles.wordRow}>
        <Text style={[styles.word, { fontSize: wordSize, color: wordColor }]}>
          Clear
        </Text>
        <Text style={[styles.word, { fontSize: wordSize, color: TEAL }]}>
          Welth
        </Text>
      </View>

      {/* Tagline */}
      {showTagline && (
        <Text style={[
          styles.tagline,
          { fontSize: tagSize, color: dark ? 'rgba(255,255,255,0.55)' : colors.textSecondary },
        ]}>
          {typeof tagline === 'string' ? tagline : 'No more silent assets'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:  { alignItems: 'center' },
  wordRow:  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, marginBottom: 4 },
  word:     { fontWeight: '800', letterSpacing: -0.5 },
  tagline:  { fontStyle: 'italic', letterSpacing: 0.1 },
});
