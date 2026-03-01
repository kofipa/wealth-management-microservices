import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const defaultFmt = (n) =>
  `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

/**
 * DonutChart — SVG donut chart using stroke-dasharray trick.
 * Props:
 *   segments      [{ label, value, color }]
 *   size          number  — outer diameter in px (default 160)
 *   strokeWidth   number  — ring thickness (default 28)
 *   formatValue   fn      — (value: number) => string  (defaults to £ formatter)
 */
export default function DonutChart({
  segments = [],
  size = 160,
  strokeWidth = 28,
  formatValue = defaultFmt,
}) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);

  if (total === 0) {
    return (
      <View style={[styles.container, { width: size }]}>
        <View
          style={[
            styles.emptyRing,
            { width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth },
          ]}
        />
        <Text style={styles.emptyLabel}>No assets yet</Text>
      </View>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  // Build arc segments
  let cumulativePercent = 0;
  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg) => {
      const percent = seg.value / total;
      const dashLength = percent * circumference;
      const offset = circumference * (1 - cumulativePercent) + circumference * 0.25;
      cumulativePercent += percent;
      return { ...seg, dashLength, offset, percent };
    });

  const visibleSegments = segments.filter((s) => s.value > 0);

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background ring */}
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc, i) => (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              rotation={-90}
              origin={`${cx}, ${cy}`}
            />
          ))}
        </Svg>
        {/* Center label */}
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.centerLabel}>
            <Text style={styles.centerLabelTop}>Total</Text>
            <Text style={styles.centerLabelValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatValue(total)}
            </Text>
          </View>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {visibleSegments.map((seg, i) => {
          const pct = ((seg.value / total) * 100).toFixed(0);
          return (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: seg.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {seg.label}
              </Text>
              <Text style={styles.legendValue}>{formatValue(seg.value)}</Text>
              <View style={[styles.legendPctBadge, { backgroundColor: seg.color + '20' }]}>
                <Text style={[styles.legendPctText, { color: seg.color }]}>{pct}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  centerLabel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabelTop: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  centerLabelValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    marginTop: 2,
  },
  emptyRing: {
    borderColor: '#f3f4f6',
    marginBottom: 8,
  },
  emptyLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  legend: {
    marginTop: 16,
    width: '100%',
    paddingHorizontal: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 10,
    flexShrink: 0,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  legendValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    marginRight: 8,
  },
  legendPctBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 38,
    alignItems: 'center',
  },
  legendPctText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
