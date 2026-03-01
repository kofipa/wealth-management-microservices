import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Polygon, Line, Text as SvgText } from 'react-native-svg';

/**
 * TrendChart — SVG sparkline showing a numeric time series.
 * Props:
 *   data    number[]   — ordered data points (oldest → newest)
 *   width   number     — chart width in px
 *   height  number     — chart height in px (default 80)
 *   color   string     — line colour (default #2563eb)
 */
export default function TrendChart({ data = [], width = 300, height = 80, color = '#2563eb' }) {
  if (!data || data.length < 2) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Text style={styles.placeholderText}>No history yet — check back tomorrow</Text>
      </View>
    );
  }

  const PAD_LEFT = 8;
  const PAD_RIGHT = 8;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 8;

  const chartW = width - PAD_LEFT - PAD_RIGHT;
  const chartH = height - PAD_TOP - PAD_BOTTOM;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const toX = (i) => PAD_LEFT + (i / (data.length - 1)) * chartW;
  const toY = (v) => PAD_TOP + chartH - ((v - minVal) / range) * chartH;

  const linePoints = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  // Polygon fills below the line
  const firstX = toX(0);
  const lastX = toX(data.length - 1);
  const bottom = PAD_TOP + chartH;
  const fillPoints = `${firstX},${bottom} ${linePoints} ${lastX},${bottom}`;

  // Trend: positive if last > first
  const positive = data[data.length - 1] >= data[0];
  const lineColor = positive ? '#16a34a' : '#ef4444';
  const fillColor = positive ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)';

  return (
    <Svg width={width} height={height}>
      {/* Baseline */}
      <Line
        x1={PAD_LEFT} y1={bottom}
        x2={PAD_LEFT + chartW} y2={bottom}
        stroke="#e5e7eb" strokeWidth="1"
      />
      {/* Fill area */}
      <Polygon points={fillPoints} fill={fillColor} />
      {/* Line */}
      <Polyline
        points={linePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
