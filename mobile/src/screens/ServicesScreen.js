import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert,
} from 'react-native';

const SERVICES = [
  {
    icon: '📜',
    title: 'Will Creation',
    description: 'Draft and store your will. Protect your estate and ensure your wishes are carried out.',
    tag: 'Estate Planning',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    icon: '🏠',
    title: 'Mortgages',
    description: 'Compare mortgage deals, get affordability estimates, and speak to an adviser.',
    tag: 'Property',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    icon: '💳',
    title: 'Personal Loans',
    description: 'Find competitive personal loan rates tailored to your financial profile.',
    tag: 'Borrowing',
    color: '#0891b2',
    bg: '#ecfeff',
  },
  {
    icon: '🛡️',
    title: 'Life Insurance',
    description: "Get covered with life insurance policies that protect your family's future.",
    tag: 'Protection',
    color: '#16a34a',
    bg: '#f0fdf4',
  },
  {
    icon: '📈',
    title: 'Investment Advice',
    description: 'Speak with a qualified financial adviser about growing your wealth.',
    tag: 'Investments',
    color: '#ea580c',
    bg: '#fff7ed',
  },
  {
    icon: '🏦',
    title: 'Pension Planning',
    description: 'Review your pension, consolidate old pots, and plan for retirement.',
    tag: 'Retirement',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    icon: '📋',
    title: 'Tax Advisory',
    description: 'Optimise your tax position with help from qualified tax professionals.',
    tag: 'Tax',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: '🔒',
    title: 'Income Protection',
    description: 'Insure your income against illness or injury so your finances stay on track.',
    tag: 'Protection',
    color: '#6d28d9',
    bg: '#f5f3ff',
  },
];

export default function ServicesScreen() {
  const handlePress = (title) => {
    Alert.alert(title, 'This service is coming soon. We\'ll notify you when it\'s available.', [
      { text: 'OK' },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Financial Services</Text>
        <Text style={styles.introSub}>Everything you need to manage and grow your wealth in one place.</Text>
      </View>

      {SERVICES.map((svc) => (
        <TouchableOpacity
          key={svc.title}
          style={styles.card}
          onPress={() => handlePress(svc.title)}
          activeOpacity={0.75}
        >
          <View style={[styles.iconBox, { backgroundColor: svc.bg }]}>
            <Text style={styles.icon}>{svc.icon}</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{svc.title}</Text>
              <View style={[styles.tag, { backgroundColor: svc.bg }]}>
                <Text style={[styles.tagText, { color: svc.color }]}>{svc.tag}</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>{svc.description}</Text>
            <Text style={[styles.cta, { color: svc.color }]}>Learn more →</Text>
          </View>
        </TouchableOpacity>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>More services coming soon</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 60 },
  intro: { marginBottom: 20, paddingHorizontal: 4 },
  introTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  introSub: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  icon: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },
  tag: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 },
  tagText: { fontSize: 11, fontWeight: '600' },
  cardDesc: { fontSize: 13, color: '#6b7280', lineHeight: 19, marginBottom: 8 },
  cta: { fontSize: 13, fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 8 },
  footerText: { fontSize: 13, color: '#9ca3af' },
});
