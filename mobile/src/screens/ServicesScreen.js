import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, SafeAreaView, Pressable, TextInput,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { createLiability } from '../api/client';

// Providers for each service, keyed by service id
const SERVICE_PROVIDERS = {
  'will-creation': [
    {
      id: 'farewill',
      name: 'Farewill',
      description: "Simple online wills from £90. UK's #1 will writing service.",
      url: 'https://farewill.com/wills',
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      id: 'beyond',
      name: 'Beyond',
      description: 'Wills, funeral planning and Lasting Power of Attorney in one place.',
      url: 'https://www.beyond.life/wills',
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      id: 'coop-wills',
      name: 'Co-op Legal Services',
      description: 'Trusted UK solicitor-backed wills and estate planning.',
      url: 'https://www.co-oplegalservices.co.uk/making-a-will/',
      color: '#0369a1',
      bg: '#eff6ff',
    },
  ],
  'mortgages': [
    {
      id: 'habito',
      name: 'Habito',
      description: 'Free online mortgage broker. Compare thousands of deals from over 90 lenders.',
      url: 'https://www.habito.com/',
      color: '#1d4ed8',
      bg: '#eff6ff',
    },
    {
      id: 'landc',
      name: 'L&C Mortgages',
      description: "UK's largest fee-free mortgage broker with whole-of-market access.",
      url: 'https://www.landc.co.uk/',
      color: '#0369a1',
      bg: '#f0f9ff',
    },
    {
      id: 'msm-mortgages',
      name: 'MoneySuperMarket',
      description: 'Compare mortgage rates from leading UK lenders in minutes.',
      url: 'https://www.moneysupermarket.com/mortgages/',
      color: '#059669',
      bg: '#ecfdf5',
    },
  ],
  'loans': [
    {
      id: 'zopa',
      name: 'Zopa',
      description: 'Award-winning personal loans from a fully regulated UK bank.',
      url: 'https://www.zopa.com/loans',
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      id: 'msm-loans',
      name: 'MoneySuperMarket',
      description: 'Check eligibility and compare personal loan rates without affecting your credit score.',
      url: 'https://www.moneysupermarket.com/loans/',
      color: '#059669',
      bg: '#ecfdf5',
    },
    {
      id: 'clearscore',
      name: 'ClearScore',
      description: 'See loans you are likely to be accepted for, tailored to your credit profile.',
      url: 'https://www.clearscore.com/loans',
      color: '#0891b2',
      bg: '#ecfeff',
    },
  ],
  'life-insurance': [
    {
      id: 'ctm-life',
      name: 'Compare the Market',
      description: 'Compare life insurance quotes from leading UK providers in minutes.',
      url: 'https://www.comparethemarket.com/life-insurance/',
      color: '#1d4ed8',
      bg: '#eff6ff',
    },
    {
      id: 'aviva-life',
      name: 'Aviva',
      description: "One of the UK's largest insurers — flexible life insurance with guaranteed premiums.",
      url: 'https://www.aviva.co.uk/insurance/life/',
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      id: 'lg-life',
      name: 'Legal & General',
      description: 'Trusted UK insurer offering straightforward term and whole-of-life policies.',
      url: 'https://www.legalandgeneral.com/insurance/life-insurance/',
      color: '#16a34a',
      bg: '#f0fdf4',
    },
  ],
  'investment-advice': [
    {
      id: 'vanguard',
      name: 'Vanguard',
      description: 'Low-cost index funds and ISAs. Invest from £500 with no adviser fees.',
      url: 'https://www.vanguardinvestor.co.uk/',
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      id: 'nutmeg',
      name: 'Nutmeg',
      description: 'Managed and fixed allocation portfolios from £100. ISA, JISA, and pension options.',
      url: 'https://www.nutmeg.com/',
      color: '#ea580c',
      bg: '#fff7ed',
    },
    {
      id: 'hl-invest',
      name: 'Hargreaves Lansdown',
      description: "UK's #1 investment platform — shares, funds, ISAs and financial planning.",
      url: 'https://www.hl.co.uk/',
      color: '#1d4ed8',
      bg: '#eff6ff',
    },
  ],
  'pension-planning': [
    {
      id: 'pensionbee',
      name: 'PensionBee',
      description: 'Combine your old pensions into one simple online plan.',
      url: 'https://www.pensionbee.com/',
      color: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      id: 'hl-pension',
      name: 'Hargreaves Lansdown',
      description: 'SIPP and pension drawdown with expert guidance and a wide fund range.',
      url: 'https://www.hl.co.uk/pensions',
      color: '#1d4ed8',
      bg: '#eff6ff',
    },
    {
      id: 'aviva-pension',
      name: 'Aviva',
      description: 'Flexible pension saving with a broad investment choice and online management.',
      url: 'https://www.aviva.co.uk/retirement/pensions/',
      color: '#dc2626',
      bg: '#fef2f2',
    },
  ],
  'tax-advisory': [
    {
      id: 'taxscouts',
      name: 'TaxScouts',
      description: 'Fixed-fee self-assessment returns filed by a certified accountant from £169.',
      url: 'https://taxscouts.com/',
      color: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      id: 'gosimpletax',
      name: 'GoSimpleTax',
      description: 'Award-winning self-assessment software — submit directly to HMRC.',
      url: 'https://gosimpletax.com/',
      color: '#16a34a',
      bg: '#f0fdf4',
    },
    {
      id: 'hmrc',
      name: 'HMRC Self Assessment',
      description: 'File your self-assessment return directly with HMRC online.',
      url: 'https://www.gov.uk/self-assessment-tax-returns',
      color: '#374151',
      bg: '#f9fafb',
    },
  ],
  'income-protection': [
    {
      id: 'ctm-ip',
      name: 'Compare the Market',
      description: 'Compare income protection quotes from leading UK providers.',
      url: 'https://www.comparethemarket.com/income-protection-insurance/',
      color: '#1d4ed8',
      bg: '#eff6ff',
    },
    {
      id: 'aviva-ip',
      name: 'Aviva',
      description: 'Income protection that pays out if you cannot work due to illness or injury.',
      url: 'https://www.aviva.co.uk/insurance/income-protection/',
      color: '#dc2626',
      bg: '#fef2f2',
    },
    {
      id: 'lv',
      name: 'LV=',
      description: 'Flexible income protection with a choice of deferred periods and benefit amounts.',
      url: 'https://www.lv.com/income-protection',
      color: '#0891b2',
      bg: '#ecfeff',
    },
  ],
};

// Optional contextual note shown at the bottom of each service's modal
const SERVICE_FOOTER_NOTES = {
  'will-creation': 'After completing your will, upload it to the Documents tab for safekeeping.',
  'mortgages': 'Once your mortgage is set up, add it as a liability in the app to track your balance.',
  'loans': 'Once your loan is agreed, add it as a liability in the app to track repayments.',
};

const SERVICES = [
  {
    id: 'will-creation',
    icon: '📜',
    title: 'Will Creation',
    description: 'Draft and store your will. Protect your estate and ensure your wishes are carried out.',
    tag: 'Estate Planning',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    id: 'mortgages',
    icon: '🏠',
    title: 'Mortgages',
    description: 'Compare mortgage deals, get affordability estimates, and speak to an adviser.',
    tag: 'Property',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    id: 'loans',
    icon: '💳',
    title: 'Personal Loans',
    description: 'Find competitive personal loan rates tailored to your financial profile.',
    tag: 'Borrowing',
    color: '#0891b2',
    bg: '#ecfeff',
  },
  {
    id: 'life-insurance',
    icon: '🛡️',
    title: 'Life Insurance',
    description: "Get covered with life insurance policies that protect your family's future.",
    tag: 'Protection',
    color: '#16a34a',
    bg: '#f0fdf4',
  },
  {
    id: 'investment-advice',
    icon: '📈',
    title: 'Investment Advice',
    description: 'Speak with a qualified financial adviser about growing your wealth.',
    tag: 'Investments',
    color: '#ea580c',
    bg: '#fff7ed',
  },
  {
    id: 'pension-planning',
    icon: '🏦',
    title: 'Pension Planning',
    description: 'Review your pension, consolidate old pots, and plan for retirement.',
    tag: 'Retirement',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    id: 'tax-advisory',
    icon: '📋',
    title: 'Tax Advisory',
    description: 'Optimise your tax position with help from qualified tax professionals.',
    tag: 'Tax',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    id: 'income-protection',
    icon: '🔒',
    title: 'Income Protection',
    description: 'Insure your income against illness or injury so your finances stay on track.',
    tag: 'Protection',
    color: '#6d28d9',
    bg: '#f5f3ff',
  },
];

// Services that show a "go to documents" prompt on return
const UPLOAD_PROMPT_SERVICES = {
  'will-creation': 'Completed your will? Upload a copy to the Documents tab for safekeeping.',
  'mortgages':     'Got a mortgage offer? Save the paperwork in the Documents tab.',
};

// Insurance services get a premium capture modal instead
const INSURANCE_SERVICES = new Set(['life-insurance', 'income-protection']);

export default function ServicesScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [activeService, setActiveService] = useState(null);
  const [providerStatus, setProviderStatus] = useState({});
  const [insurancePrompt, setInsurancePrompt] = useState({ visible: false, provider: null });
  const [monthlyPremium, setMonthlyPremium] = useState('');
  const [savingPremium, setSavingPremium] = useState(false);

  useEffect(() => {
    if (!activeService) return;
    const providers = SERVICE_PROVIDERS[activeService.id] || [];
    const initial = {};
    providers.forEach((p) => { initial[p.id] = 'checking'; });
    setProviderStatus(initial);

    const isReachable = (status) => status !== 404 && status !== 410 && status < 500;

    const checkProvider = async (provider) => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html',
      };
      // Try HEAD first (no body download)
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(provider.url, { method: 'HEAD', signal: ctrl.signal, headers });
        clearTimeout(t);
        if (isReachable(res.status)) return 'ok';
      } catch {}
      // Fallback: GET (handles sites that reject HEAD)
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(provider.url, { method: 'GET', signal: ctrl.signal, headers });
        clearTimeout(t);
        if (isReachable(res.status)) return 'ok';
      } catch {}
      return 'error';
    };

    providers.forEach(async (provider) => {
      const status = await checkProvider(provider);
      setProviderStatus((prev) => ({ ...prev, [provider.id]: status }));
    });
  }, [activeService]);

  const handlePress = (svc) => {
    if (SERVICE_PROVIDERS[svc.id]) {
      setActiveService(svc);
      return;
    }
    Alert.alert(svc.title, "This service is coming soon. We'll notify you when it's available.", [
      { text: 'OK' },
    ]);
  };

  const handleOpenProvider = async (provider) => {
    const params = new URLSearchParams();
    if (user?.email) params.set('email', user.email);
    const nameParts = (user?.name || '').split(' ').filter(Boolean);
    if (nameParts[0]) params.set('first_name', nameParts[0]);
    if (nameParts.length > 1) params.set('last_name', nameParts.slice(1).join(' '));
    const url = `${provider.url}?${params.toString()}`;

    await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'done',
      toolbarColor: provider.color,
      showTitle: true,
      enableBarCollapsing: true,
    });

    // User is back — offer a contextual follow-up
    const serviceId = activeService?.id;
    if (INSURANCE_SERVICES.has(serviceId)) {
      setInsurancePrompt({ visible: true, provider });
    } else {
      const uploadPrompt = UPLOAD_PROMPT_SERVICES[serviceId];
      if (uploadPrompt) {
        Alert.alert('Welcome back!', uploadPrompt, [
          { text: 'Later', style: 'cancel' },
          { text: 'Go to Documents', onPress: () => navigation.navigate('Documents') },
        ]);
      }
    }
  };

  const handleAddPremium = async () => {
    const monthly = parseFloat(monthlyPremium);
    if (!monthly || monthly <= 0) return;
    setSavingPremium(true);
    try {
      await createLiability({
        type: 'short-term',
        name: `${insurancePrompt.provider?.name} — Insurance Premium`,
        amount: monthly * 12,
        currency: 'GBP',
        description: `Annual premium (£${monthly.toFixed(2)}/month × 12)`,
      });
      setInsurancePrompt({ visible: false, provider: null });
      setMonthlyPremium('');
      Alert.alert('Added!', 'Your annual insurance premium has been logged as a short-term liability.');
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSavingPremium(false);
    }
  };

  const activeProviders = activeService ? (SERVICE_PROVIDERS[activeService.id] || []) : [];
  const visibleProviders = activeProviders.filter((p) => providerStatus[p.id] !== 'error');
  const allChecked = activeProviders.length > 0 && activeProviders.every((p) => providerStatus[p.id] !== 'checking');
  const allFailed = allChecked && visibleProviders.length === 0;
  const footerNote = activeService ? SERVICE_FOOTER_NOTES[activeService.id] : null;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Financial Services</Text>
          <Text style={styles.introSub}>Everything you need to manage and grow your wealth in one place.</Text>
        </View>

        {SERVICES.map((svc) => (
          <TouchableOpacity
            key={svc.id}
            style={styles.card}
            onPress={() => handlePress(svc)}
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
              <Text style={[styles.cta, { color: svc.color }]}>
                {SERVICE_PROVIDERS[svc.id] ? 'Find a provider →' : 'Learn more →'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>More services coming soon</Text>
        </View>
      </ScrollView>

      <Modal
        visible={!!activeService}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveService(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setActiveService(null)} />
        <View style={styles.sheet}>
          <SafeAreaView>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{activeService?.title}</Text>
              <TouchableOpacity onPress={() => setActiveService(null)} hitSlop={12}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetIntro}>
              We'll pass your details to get you started faster.
            </Text>

            {visibleProviders.map((provider) => (
              <View key={provider.id} style={[styles.providerCard, { borderColor: provider.color + '33' }]}>
                <View style={[styles.providerCardHeader, { backgroundColor: provider.bg }]}>
                  <Text style={[styles.providerName, { color: provider.color }]}>{provider.name}</Text>
                </View>
                <Text style={styles.providerDesc}>{provider.description}</Text>
                <TouchableOpacity
                  style={[styles.getStartedBtn, { backgroundColor: providerStatus[provider.id] === 'checking' ? '#9ca3af' : provider.color }]}
                  onPress={() => handleOpenProvider(provider)}
                  disabled={providerStatus[provider.id] === 'checking'}
                  activeOpacity={0.8}
                >
                  <Text style={styles.getStartedText}>
                    {providerStatus[provider.id] === 'checking' ? 'Checking…' : 'Get Started →'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            {allFailed && (
              <Text style={styles.noProvidersNote}>
                No providers are currently available. Please try again later.
              </Text>
            )}

            {footerNote && (
              <Text style={styles.sheetFooterNote}>{footerNote}</Text>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Insurance premium capture modal */}
      <Modal
        visible={insurancePrompt.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setInsurancePrompt({ visible: false, provider: null })}
      >
        <Pressable style={styles.overlay} onPress={() => setInsurancePrompt({ visible: false, provider: null })} />
        <View style={styles.sheet}>
          <SafeAreaView>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Log Your Premium</Text>
              <TouchableOpacity onPress={() => setInsurancePrompt({ visible: false, provider: null })} hitSlop={12}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetIntro}>
              Did you take out a policy with {insurancePrompt.provider?.name}? Enter your monthly premium and we'll track the annual cost in your liabilities.
            </Text>

            <View style={styles.premiumRow}>
              <Text style={styles.premiumCurrency}>£</Text>
              <TextInput
                style={styles.premiumInput}
                value={monthlyPremium}
                onChangeText={setMonthlyPremium}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.premiumPerMonth}>/month</Text>
            </View>

            {!!monthlyPremium && parseFloat(monthlyPremium) > 0 && (
              <Text style={styles.premiumAnnual}>
                Annual cost: £{(parseFloat(monthlyPremium) * 12).toFixed(2)} — added as a short-term liability
              </Text>
            )}

            <TouchableOpacity
              style={[styles.getStartedBtn, {
                backgroundColor: (!monthlyPremium || parseFloat(monthlyPremium) <= 0 || savingPremium) ? '#9ca3af' : '#2563eb',
                marginTop: 20,
              }]}
              onPress={handleAddPremium}
              disabled={!monthlyPremium || parseFloat(monthlyPremium) <= 0 || savingPremium}
              activeOpacity={0.8}
            >
              <Text style={styles.getStartedText}>
                {savingPremium ? 'Saving…' : 'Add to Liabilities →'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => { setInsurancePrompt({ visible: false, provider: null }); setMonthlyPremium(''); }}
            >
              <Text style={styles.skipText}>Not yet — skip</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </>
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

  // Provider modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  closeBtn: { fontSize: 18, color: '#6b7280', paddingHorizontal: 4 },
  sheetIntro: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 19 },
  providerCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  providerCardHeader: { paddingHorizontal: 14, paddingVertical: 10 },
  providerName: { fontSize: 15, fontWeight: '700' },
  providerDesc: { fontSize: 13, color: '#374151', lineHeight: 19, paddingHorizontal: 14, paddingVertical: 10 },
  getStartedBtn: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  getStartedText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  noProvidersNote: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingVertical: 16, lineHeight: 19 },
  sheetFooterNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, lineHeight: 17 },

  // Insurance premium modal
  premiumRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, marginTop: 8 },
  premiumCurrency: { fontSize: 20, fontWeight: '600', color: '#111827', marginRight: 4 },
  premiumInput: { flex: 1, fontSize: 22, fontWeight: '700', color: '#111827', paddingVertical: 14 },
  premiumPerMonth: { fontSize: 14, color: '#6b7280' },
  premiumAnnual: { fontSize: 13, color: '#2563eb', marginTop: 8, textAlign: 'center' },
  skipBtn: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
  skipText: { fontSize: 13, color: '#9ca3af' },
});
