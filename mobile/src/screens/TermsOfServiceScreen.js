import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

const SECTIONS = [
  {
    title: '1. The service',
    items: [
      {
        label: 'What Clearwelth provides',
        detail: 'Clearwelth is a personal wealth management app that helps you track assets, liabilities, documents, and net worth. It is provided by KPA Group Ltd, trading as Clearwelth.',
      },
      {
        label: 'Not financial advice',
        detail: 'Clearwelth is a financial organisation tool only. Nothing in the app constitutes financial, investment, tax or legal advice. Always consult a qualified professional before making financial decisions.',
      },
      {
        label: 'Eligibility',
        detail: 'You must be 18 or older and a UK resident to use Clearwelth.',
      },
    ],
  },
  {
    title: '2. Your account',
    items: [
      {
        label: 'Registration',
        detail: 'You must provide accurate and up-to-date information when registering. You are responsible for all activity that occurs under your account.',
      },
      {
        label: 'Keeping credentials secure',
        detail: 'Keep your password confidential. Do not share your account with others. Notify us immediately at support@clearwelth.com if you suspect unauthorised access.',
      },
      {
        label: 'One account per person',
        detail: 'Accounts are for individual use only. You may not create accounts on behalf of others without their consent.',
      },
    ],
  },
  {
    title: '3. Acceptable use',
    items: [
      {
        label: 'Permitted use',
        detail: 'You may use Clearwelth solely for your own personal wealth management. You may not use the service for commercial, fraudulent, or illegal purposes.',
      },
      {
        label: 'Prohibited conduct',
        detail: 'You must not attempt to reverse-engineer, scrape, or interfere with the service; upload malicious files; impersonate others; or violate any applicable law or regulation.',
      },
    ],
  },
  {
    title: '4. Your data',
    items: [
      {
        label: 'Ownership',
        detail: 'You own all financial data you enter into Clearwelth. We do not claim any ownership over your data.',
      },
      {
        label: 'How we use it',
        detail: 'We use your data solely to provide and improve the service. We do not sell your data to third parties. See our Privacy & Security screen for full details.',
      },
      {
        label: 'Data accuracy',
        detail: 'Clearwelth displays data you enter. We are not responsible for inaccuracies in valuations, market prices, or any financial figures sourced from third-party providers (HM Land Registry, Yahoo Finance, DVLA).',
      },
    ],
  },
  {
    title: '5. Open banking',
    items: [
      {
        label: 'Third-party provider',
        detail: 'Bank account connections are powered by TrueLayer, a regulated third-party open banking provider. By connecting a bank account you agree to TrueLayer\'s terms of service in addition to ours.',
      },
      {
        label: 'Read-only access',
        detail: 'Clearwelth only requests read-only access to your bank account data. We cannot initiate payments or transfer funds.',
      },
    ],
  },
  {
    title: '6. Trusted contacts & delegation',
    items: [
      {
        label: 'Digital legacy',
        detail: 'You may nominate trusted contacts who can access your account after a period of inactivity. You are responsible for choosing contacts you trust and for keeping your nominations up to date.',
      },
      {
        label: 'Delegated access',
        detail: 'Delegated access tokens are time-limited (8 hours). We are not liable for actions taken by nominees accessing your account in accordance with your delegation settings.',
      },
    ],
  },
  {
    title: '7. Intellectual property',
    items: [
      {
        label: 'Ownership',
        detail: 'All software, branding, and content in Clearwelth is owned by KPA Group Ltd or its licensors. You may not copy, modify, distribute, or create derivative works without our written permission.',
      },
    ],
  },
  {
    title: '8. Disclaimers & liability',
    items: [
      {
        label: 'Service availability',
        detail: 'We aim for high availability but cannot guarantee uninterrupted access. We may suspend the service for maintenance or security reasons.',
      },
      {
        label: 'Third-party data',
        detail: 'Property valuations (HM Land Registry), investment prices (Yahoo Finance), and vehicle estimates are provided for indicative purposes only and may not reflect current market values.',
      },
      {
        label: 'Limitation of liability',
        detail: 'To the fullest extent permitted by law, KPA Group Ltd\'s total liability to you for any claim arising from your use of Clearwelth shall not exceed the amount you have paid us in the 12 months preceding the claim (or £100 if you have paid nothing).',
      },
      {
        label: 'No warranty',
        detail: 'The service is provided "as is" without warranty of any kind. We do not warrant that the service will be error-free, secure, or meet your specific requirements.',
      },
    ],
  },
  {
    title: '9. Changes & termination',
    items: [
      {
        label: 'Changes to these terms',
        detail: 'We may update these Terms of Service from time to time. Continued use of Clearwelth after changes are posted constitutes acceptance of the updated terms.',
      },
      {
        label: 'Account termination',
        detail: 'You may delete your account at any time from Profile → Delete Account. We may suspend or terminate accounts that violate these terms.',
      },
    ],
  },
  {
    title: '10. Governing law',
    items: [
      {
        label: 'Jurisdiction',
        detail: 'These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
      },
    ],
  },
];

export default function TermsOfServiceScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          By using Clearwelth you agree to these Terms of Service. Please read them carefully.
        </Text>
        <Text style={styles.effective}>Effective date: 12 March 2026</Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
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

        <Text style={styles.footer}>
          Questions? Contact us at{' '}
          <Text
            style={styles.footerLink}
            onPress={() => Linking.openURL('mailto:support@clearwelth.com')}
          >
            support@clearwelth.com
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
    marginBottom: 6,
  },
  effective: {
    fontSize: 12,
    color: colors.textTertiary,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  item: { paddingHorizontal: 16, paddingVertical: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 },
  itemDetail: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  footer: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, marginTop: 8 },
  footerLink: { color: colors.primary },
});
