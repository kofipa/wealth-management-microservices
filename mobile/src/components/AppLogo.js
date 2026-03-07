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
 *  • W — letter W whose final stroke turns into an upward trend arrow
 *
 * viewBox "0 0 80 58" centred around the two glyphs.
 */
function CWMark({ sz, onDark = false }) {
  const stroke = onDark ? '#ffffff' : NAVY;
  const accent = TEAL;
  const sw = sz / 10; // stroke width scales with size

  return (
    <Svg width={sz} height={sz * 0.73} viewBox="0 0 80 58">
      {/* ── C arc (navy / white on dark) ─────────────────────────────── */}
      {/* Circle centre (20, 30) r=20. Opens right: NE → (arc CCW) → SE */}
      <Path
        d="M 37 16 A 20 20 0 1 0 37 44"
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* ── Teal accent — small top segment ──────────────────────────── */}
      {/* From 12-o'clock (20,10) clockwise to NE opening (37,16) */}
      <Path
        d="M 20 10 A 20 20 0 0 1 37 16"
        fill="none"
        stroke={accent}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {/* ── W + upward trend arrow ────────────────────────────────────── */}
      {/* Four strokes: down-right, up-left to mid-peak, down-right,
          then rises steeply up-right as the arrow */}
      <Path
        d="M 38 14 L 44 46 L 51 24 L 58 46 L 69 10"
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow tip at (69, 10) */}
      <Path
        d="M 69 10 L 62 14 M 69 10 L 67 18"
        fill="none"
        stroke={stroke}
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
  const { colors } = useTheme();
  const large = size === 'large';
  const showTagline = tagline !== undefined ? !!tagline : large;

  const markSize  = large ? 72 : 44;
  const wordSize  = large ? 28 : 17;
  const dotComSize = large ? 13 : 9;
  const tagSize   = large ? 13 : 10;
  const wordColor = onDark ? '#ffffff' : NAVY;

  return (
    <View style={styles.wrapper}>
      {/* CW monogram */}
      <CWMark sz={markSize} onDark={onDark} />

      {/* Wordmark: Clear + Welth */}
      <View style={styles.wordRow}>
        <Text style={[styles.word, { fontSize: wordSize, color: wordColor }]}>
          Clear
        </Text>
        <Text style={[styles.word, { fontSize: wordSize, color: TEAL }]}>
          Welth
        </Text>
        <Text style={[styles.dotcom, { fontSize: dotComSize, color: wordColor, opacity: 0.55 }]}>
          .com
        </Text>
      </View>

      {/* Tagline */}
      {showTagline && (
        <Text style={[
          styles.tagline,
          { fontSize: tagSize, color: onDark ? 'rgba(255,255,255,0.55)' : colors.textSecondary },
        ]}>
          No more silent assets
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:  { alignItems: 'center' },
  wordRow:  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, marginBottom: 4 },
  word:     { fontWeight: '800', letterSpacing: -0.5 },
  dotcom:   { fontWeight: '600', marginLeft: 1, marginBottom: 2 },
  tagline:  { fontStyle: 'italic', letterSpacing: 0.1 },
});
