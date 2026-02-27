import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';

const ITEM_H = 48;
const VISIBLE = 5;
const PAD = ITEM_H * Math.floor(VISIBLE / 2); // padding so first/last items can be centred

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEARS = Array.from({ length: 131 }, (_, i) => 1950 + i); // 1950–2080

function daysInMonth(year, month) {
  // month is 1-indexed; new Date(y, m, 0) = last day of month m
  return new Date(year, month, 0).getDate();
}

function WheelColumn({ data, selectedIndex, onChange }) {
  const ref = useRef(null);
  const mounted = useRef(false);

  // Initial scroll (no animation — layout must be ready)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
      mounted.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, []);

  // Scroll when selectedIndex changes externally (e.g. days column clamped)
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
          <Text style={[styles.wheelText, i === selectedIndex && styles.wheelTextSelected]}>
            {item}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function DatePickerField({ label, value, onChange }) {
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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={handleOpen} activeOpacity={0.7}>
        <Text style={[styles.buttonText, !value && styles.placeholder]}>{display}</Text>
        <Text style={styles.calIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setShow(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Select Date</Text>
              <TouchableOpacity onPress={handleConfirm}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Column labels */}
            <View style={styles.colLabels}>
              <Text style={styles.colLabel}>Day</Text>
              <Text style={styles.colLabel}>Month</Text>
              <Text style={styles.colLabel}>Year</Text>
            </View>

            {/* Wheel picker */}
            <View style={styles.wheelRow}>
              {/* Centre highlight bar */}
              <View pointerEvents="none" style={styles.selectionBar} />
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
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff', marginBottom: 12,
  },
  buttonText: { fontSize: 15, color: '#111827' },
  placeholder: { color: '#9ca3af' },
  calIcon: { fontSize: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cancelText: { fontSize: 16, color: '#6b7280' },
  doneText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
  colLabels: {
    flexDirection: 'row', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 4,
  },
  colLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 11, fontWeight: '600', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  wheelRow: { flexDirection: 'row', paddingHorizontal: 16, position: 'relative' },
  selectionBar: {
    position: 'absolute',
    left: 16, right: 16,
    top: ITEM_H * 2,
    height: ITEM_H,
    backgroundColor: '#eff6ff',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
  },
  wheelItem: { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  wheelText: { fontSize: 17, color: '#9ca3af' },
  wheelTextSelected: { color: '#1d4ed8', fontWeight: '700' },
});
