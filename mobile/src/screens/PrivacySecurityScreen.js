import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

const SECTIONS = [
  {
    title: 'Data we collect',
    icon: '📋',
    items: [
      { label: 'Account', detail: 'Email address, name' },
      { label: 'Personal details', detail: 'Phone, date of birth, address — stored encrypted' },
      { label: 'Financial data', detail: 'Assets, liabilities, net worth snapshots' },
      { label: 'Documents', detail: 'Files you upload (stored securely on our servers)' },
      { label: 'Open banking', detail: 'Bank account data if you connect a bank (optional)' },
    ],
  },
  {
    title: 'How we protect it',
    icon: '🔒',
    items: [
      { label: 'Personal details encrypted', detail: 'Phone, date of birth and address are AES-256-GCM encrypted before storage' },
      { label: 'Passwords never stored', detail: 'Passwords are one-way hashed with bcrypt — we cannot read them' },
      { label: 'Encrypted in transit', detail: 'All communication uses HTTPS/TLS — data is encrypted between your device and our servers' },
      { label: 'Authentication required', detail: 'Every API request requires a valid token — no data is accessible without logging in' },
      { label: 'Secure infrastructure', detail: 'Hosted on Railway (AWS) with encrypted storage at rest' },
    ],
  },
  {
    title: 'Your rights',
    icon: '✅',
    items: [
      { label: 'Access your data', detail: 'All your data is visible to you within the app at any time' },
      { label: 'Delete your account', detail: 'You can permanently delete your account and all associated data from Profile → Delete Account' },
      { label: 'Contact us', detail: 'For data requests or concerns: privacy@clearwelth.com' },
    ],
  },
];

export default function PrivacySecurityScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          We take your privacy seriously. Here's exactly what we collect, how we protect it, and your rights as a user.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>{section.icon}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.items.map((item, i) => (
              <View
                key={item.label}
                style={[styles.item, i < section.items.length - 1 && styles.itemBorder]}
              >
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemDetail}>{item.detail}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Privacy Policy */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📄</Text>
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
          </View>
          <View style={[styles.item, styles.itemBorder]}>
            <Text style={styles.itemLabel}>Data controller</Text>
            <Text style={styles.itemDetail}>KPA Group Ltd, trading as Clearwelth</Text>
          </View>
          <View style={[styles.item, styles.itemBorder]}>
            <Text style={styles.itemLabel}>Purpose of processing</Text>
            <Text style={styles.itemDetail}>To provide you with a personal wealth management service, including tracking assets, liabilities, and documents.</Text>
          </View>
          <View style={[styles.item, styles.itemBorder]}>
            <Text style={styles.itemLabel}>Legal basis</Text>
            <Text style={styles.itemDetail}>Performance of a contract (providing the service you signed up for) and legitimate interests in keeping your data secure.</Text>
          </View>
          <View style={[styles.item, styles.itemBorder]}>
            <Text style={styles.itemLabel}>Data sharing</Text>
            <Text style={styles.itemDetail}>We do not sell or share your personal data with third parties for marketing purposes. Infrastructure providers (Railway/AWS) process data on our behalf under data processing agreements.</Text>
          </View>
          <View style={[styles.item, styles.itemBorder]}>
            <Text style={styles.itemLabel}>Retention</Text>
            <Text style={styles.itemDetail}>Your data is retained for as long as your account is active. On account deletion, all personal data is permanently removed.</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.itemLabel}>Your rights</Text>
            <Text style={styles.itemDetail}>Under UK GDPR you have the right to access, rectify, erase, and port your data. To exercise these rights contact us at privacy@clearwelth.com.</Text>
          </View>
        </View>

        {/* UK Data Protection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🇬🇧</Text>
            <Text style={styles.sectionTitle}>UK Data Protection</Text>
          </View>
          <View style={styles.item}>
            <Text style={styles.itemDetail}>
              Clearwelth is committed to compliance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. If you have a complaint about how we handle your data, you can contact the Information Commissioner's Office (ICO) at ico.org.uk.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Questions? Contact us at{' '}
          <Text
            style={styles.footerLink}
            onPress={() => Linking.openURL('mailto:privacy@clearwelth.com')}
          >
            privacy@clearwelth.com
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 64 },
  backText: { color: colors.primary, fontSize: 17 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  content: { padding: 16, paddingBottom: 40 },
  intro: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  item: { paddingHorizontal: 16, paddingVertical: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 },
  itemDetail: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  linkChevron: { fontSize: 20, color: colors.primary },
  footer: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  footerLink: { color: colors.primary },
});
