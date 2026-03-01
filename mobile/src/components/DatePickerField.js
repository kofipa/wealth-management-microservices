import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ITEM_H = 48;
const VISIBLE = 5;
const PAD = ITEM_H * Math.floor(VISIBLE / 2);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = Array.from({ length: 131 }, (_, i) => 1950 + i);

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function WheelColumn({ data, selectedIndex, onChange }) {
  const { colors } = useTheme();
  const ref = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
      mounted.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (mounted.current) {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: true });
    }
  }, [selectedIndex]);

  const handleEnd = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    onChange(Math.max(0, Math.min(idx, data.length - 1)));
  }, [data.length, onChange]);

  return (
    <ScrollView
      ref={ref}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: PAD }}
      style={{ height: ITEM_H * VISIBLE, flex: 1 }}
      onMomentumScrollEnd={handleEnd}
      onScrollEndDrag={handleEnd}
    >
      {data.map((item, i) => (
        <TouchableOpacity
          key={item}
          style={styles.wheelItem}
          onPress={() => {
            ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
            onChange(i);
          }}
        >
          <Text style={[
            styles.wheelText,
            { color: colors.textTertiary },
            i === selectedIndex && { color: colors.primary, fontWeight: '700' },
          ]}>
            {item}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function DatePickerField({ label, value, onChange }) {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);

  const parseValue = () => {
    const d = value ? new Date(value + 'T12:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  };

  const [sel, setSel] = useState(parseValue);

  const numDays = daysInMonth(sel.year, sel.month);
  const days = Array.from({ length: numDays }, (_, i) => String(i + 1).padStart(2, '0'));
  const safeDay = Math.min(sel.day, numDays);
  const yearIdx = YEARS.indexOf(sel.year);

  const handleOpen = () => {
    setSel(parseValue());
    setShow(true);
  };

  const handleConfirm = () => {
    const d = Math.min(sel.day, numDays);
    const m = String(sel.month).padStart(2, '0');
    onChange(`${sel.year}-${m}-${String(d).padStart(2, '0')}`);
    setShow(false);
  };

  const display = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : 'Select date';

  return (
    <View>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: value ? colors.text : colors.placeholder }]}>{display}</Text>
        <Text style={styles.calIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide">
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShow(false)}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Select Date</Text>
              <TouchableOpacity onPress={handleConfirm}>
                <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.colLabels}>
              <Text style={[styles.colLabel, { color: colors.textTertiary }]}>Day</Text>
              <Text style={[styles.colLabel, { color: colors.textTertiary }]}>Month</Text>
              <Text style={[styles.colLabel, { color: colors.textTertiary }]}>Year</Text>
            </View>

            <View style={styles.wheelRow}>
              <View
                pointerEvents="none"
                style={[styles.selectionBar, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
              />
              <WheelColumn
                data={days}
                selectedIndex={safeDay - 1}
                onChange={(i) => setSel((p) => ({ ...p, day: i + 1 }))}
              />
              <WheelColumn
                data={MONTH_NAMES}
                selectedIndex={sel.month - 1}
                onChange={(i) => setSel((p) => ({ ...p, month: i + 1 }))}
              />
              <WheelColumn
                data={YEARS.map(String)}
                selectedIndex={yearIdx >= 0 ? yearIdx : 25}
                onChange={(i) => setSel((p) => ({ ...p, year: YEARS[i] }))}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12,
  },
  buttonText: { fontSize: 15 },
  calIcon: { fontSize: 16 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
  cancelText: { fontSize: 16 },
  doneText: { fontSize: 16, fontWeight: '600' },
  colLabels: { flexDirection: 'row', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4 },
  colLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  wheelRow: { flexDirection: 'row', paddingHorizontal: 16, position: 'relative' },
  selectionBar: {
    position: 'absolute',
    left: 16, right: 16,
    top: ITEM_H * 2,
    height: ITEM_H,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderRadius: 8,
  },
  wheelItem: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  wheelText: { fontSize: 17 },
});
