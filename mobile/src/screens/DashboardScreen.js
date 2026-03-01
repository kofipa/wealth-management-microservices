import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  RefreshControl, ActivityIndicator, TouchableOpacity, Animated,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getNetWorthBreakdown, getNetWorthHistory } from '../api/client';
import { useAuth } from '../context/AuthContext';
import TrendChart from '../components/TrendChart';

const SCREEN_WIDTH = Dimensions.get('window').width;

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const fmtLabel = (s) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const buildRecommendations = (data) => {
  const totalAssets = parseFloat(data?.totalAssets ?? 0);
  const totalLiabilities = parseFloat(data?.totalLiabilities ?? 0);
  const netWorth = totalAssets - totalLiabilities;
  const hasProperty = (data?.assetsByType?.property ?? 0) > 0;
  const hasInvestments = (data?.assetsByType?.investment ?? 0) > 0;
  const hasShortTermDebt = (data?.liabilitiesByType?.short_term ?? 0) > 0;
  const isLowAssets = totalAssets < 5000;
  const isHighDebt = totalLiabilities > 0 && (totalLiabilities > totalAssets * 0.5 || netWorth < 0);

  const recs = [];

  // Credit score — surface early for users with little wealth or any debt
  if (isLowAssets || hasShortTermDebt || isHighDebt) {
    recs.push({
      id: 'loans', icon: '⭐', title: 'Check Your Credit Score',
      nudge: 'See your score for free and find ways to improve it',
      color: '#0891b2', bg: '#ecfeff',
    });
  }

  // Debt management — when liabilities are significant relative to assets
  if (isHighDebt || hasShortTermDebt) {
    recs.push({
      id: 'loans', icon: '🧾', title: 'Debt Management',
      nudge: totalLiabilities > totalAssets
        ? `Your liabilities exceed your assets — explore debt consolidation`
        : 'Consolidate or reduce your debts with expert help',
      color: '#dc2626', bg: '#fef2f2',
    });
  }

  if (totalAssets > 10000 || hasProperty) {
    recs.push({
      id: 'will-creation', icon: '📜', title: 'Will Creation',
      nudge: `Protect your ${fmt(totalAssets)} estate for your loved ones`,
      color: '#7c3aed', bg: '#f5f3ff',
    });
  }

  recs.push({
    id: 'pension-planning', icon: '🏦', title: 'Pension Planning',
    nudge: 'Consolidate old pots and plan for retirement',
    color: '#d97706', bg: '#fffbeb',
  });

  recs.push({
    id: 'life-insurance', icon: '🛡️', title: 'Life Insurance',
    nudge: "Protect your family's financial future",
    color: '#16a34a', bg: '#f0fdf4',
  });

  if (totalAssets > 5000 || hasInvestments) {
    recs.push({
      id: 'investment-advice', icon: '📈', title: 'Investment Advice',
      nudge: 'Get expert guidance to grow your wealth',
      color: '#ea580c', bg: '#fff7ed',
    });
  }

  if (hasProperty) {
    recs.push({
      id: 'mortgages', icon: '🏠', title: 'Mortgages',
      nudge: 'Check if you could get a better deal',
      color: '#2563eb', bg: '#eff6ff',
    });
  }

  recs.push({
    id: 'income-protection', icon: '🔒', title: 'Income Protection',
    nudge: 'Cover yourself if you cannot work',
    color: '#6d28d9', bg: '#f5f3ff',
  });

  recs.push({
    id: 'tax-advisory', icon: '📋', title: 'Tax Advisory',
    nudge: 'Optimise your tax position with a professional',
    color: '#dc2626', bg: '#fef2f2',
  });

  // Personal loans only for users without property and without debt management card
  if (!hasProperty && !isHighDebt && !hasShortTermDebt) {
    recs.push({
      id: 'loans', icon: '💳', title: 'Personal Loans',
      nudge: 'Compare competitive personal loan rates',
      color: '#0891b2', bg: '#ecfeff',
    });
  }

  return recs;
};

const ROTATION_MS = 4000;

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [recIndex, setRecIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef(null);

  const recommendations = useMemo(() => (data ? buildRecommendations(data) : []), [data]);

  const fadeTo = useCallback((nextIndex, cb) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      cb(nextIndex);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const startRotation = useCallback((len) => {
    clearInterval(intervalRef.current);
    if (len <= 1) return;
    intervalRef.current = setInterval(() => {
      fadeTo(null, () => setRecIndex((i) => (i + 1) % len));
    }, ROTATION_MS);
  }, [fadeTo]);

  // Start/restart rotation whenever recommendations list changes
  useEffect(() => {
    startRotation(recommendations.length);
  }, [recommendations.length, startRotation]);

  // Clean up on unmount
  const cleanupRef = useRef(null);
  cleanupRef.current = () => clearInterval(intervalRef.current);
  useFocusEffect(useCallback(() => {
    return () => cleanupRef.current?.();
  }, []));

  const goToIndex = (i) => {
    fadeTo(i, (idx) => setRecIndex(idx));
    startRotation(recommendations.length); // reset timer on manual tap
  };

  const load = async () => {
    try {
      setError(null);
      const [breakdownRes, historyRes] = await Promise.allSettled([
        getNetWorthBreakdown(),
        getNetWorthHistory(30),
      ]);
      if (breakdownRes.status === 'fulfilled') {
        setData(breakdownRes.value.data);
        setRecIndex(0);
      } else {
        setError('Could not load net worth data');
      }
      if (historyRes.status === 'fulfilled') {
        setHistory(historyRes.value.data.history || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const netWorth = data?.netWorth ?? 0;
  const totalAssets = data?.totalAssets ?? 0;
  const totalLiabilities = data?.totalLiabilities ?? 0;
  const isPositive = netWorth >= 0;
  const liabilitiesByType = data?.liabilitiesByType ? Object.entries(data.liabilitiesByType) : [];

  // Monthly change — compare current live values vs oldest snapshot
  const historyValues = history.map(h => parseFloat(h.net_worth));
  const monthlyChange = history.length >= 1
    ? parseFloat(netWorth) - historyValues[0]
    : null;
  const assetsTrend = history.length >= 1
    ? parseFloat(totalAssets) - parseFloat(history[0].total_assets)
    : null;
  const liabsTrend = history.length >= 1
    ? parseFloat(totalLiabilities) - parseFloat(history[0].total_liabilities)
    : null;

  // Donut chart segments
  const ASSET_COLORS = {
    cash: '#2563eb',
    investment: '#7c3aed',
    property: '#16a34a',
    vehicle: '#f59e0b',
    insurance: '#0891b2',
    other: '#9ca3af',
  };
  const ASSET_LABELS = {
    cash: 'Cash & Savings',
    investment: 'Investments',
    property: 'Property',
    vehicle: 'Vehicles',
    insurance: 'Insurance',
    other: 'Other Assets',
  };
  const donutSegments = Object.entries(data?.assetsByType || {}).map(([type, value]) => ({
    label: ASSET_LABELS[type] || fmtLabel(type),
    value: parseFloat(value) || 0,
    color: ASSET_COLORS[type] || '#9ca3af',
  }));

  const currentIndex = recommendations.length > 0 ? recIndex % recommendations.length : 0;
  const svc = recommendations[currentIndex];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>
        {user?.email ? `Hello, ${user.email.split('@')[0]}` : 'Dashboard'}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={[styles.netWorthCard, isPositive ? styles.positive : styles.negative]}>
        <Text style={styles.netWorthLabel}>Net Worth</Text>
        <Text style={styles.netWorthValue}>{fmt(netWorth)}</Text>
        {monthlyChange !== null ? (
          <Text style={[styles.netWorthDelta, monthlyChange >= 0 ? styles.deltaPos : styles.deltaNeg]}>
            {monthlyChange >= 0 ? '↑' : '↓'} {monthlyChange >= 0 ? '+' : ''}{fmt(monthlyChange)} this month
          </Text>
        ) : (
          <Text style={styles.netWorthSub}>{isPositive ? 'Assets exceed liabilities' : 'Liabilities exceed assets'}</Text>
        )}
        {historyValues.length >= 2 && (
          <View style={styles.trendWrap}>
            <TrendChart
              data={historyValues}
              width={SCREEN_WIDTH - 96}
              height={56}
            />
          </View>
        )}
      </View>

      <View style={styles.row}>
        <View style={[styles.summaryCard, styles.cardGreen]}>
          <Text style={styles.cardLabel}>Total Assets</Text>
          <Text style={styles.cardValue}>{fmt(totalAssets)}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 4, color: assetsTrend === null ? '#9ca3af' : assetsTrend >= 0 ? '#15803d' : '#dc2626' }}>
            {assetsTrend === null ? '— 30-day trend' : `${assetsTrend >= 0 ? '↑' : '↓'} ${assetsTrend >= 0 ? '+' : ''}${fmt(assetsTrend)}`}
          </Text>
        </View>
        <View style={[styles.summaryCard, styles.cardRed]}>
          <Text style={styles.cardLabel}>Total Liabilities</Text>
          <Text style={styles.cardValue}>{fmt(totalLiabilities)}</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 4, color: liabsTrend === null ? '#9ca3af' : liabsTrend <= 0 ? '#15803d' : '#dc2626' }}>
            {liabsTrend === null ? '— 30-day trend' : `${liabsTrend <= 0 ? '↓' : '↑'} ${liabsTrend > 0 ? '+' : ''}${fmt(liabsTrend)}`}
          </Text>
        </View>
      </View>

      {svc && (
        <View style={styles.recsSection}>
          <Text style={styles.recsSectionTitle}>Recommended for you</Text>
          <Animated.View style={{ opacity: fadeAnim }}>
            <TouchableOpacity
              style={[styles.recCard, { borderLeftColor: svc.color, borderLeftWidth: 4 }]}
              onPress={() => navigation.navigate('Services')}
              activeOpacity={0.8}
            >
              <View style={[styles.recIconBox, { backgroundColor: svc.bg }]}>
                <Text style={styles.recIcon}>{svc.icon}</Text>
              </View>
              <View style={styles.recTextBox}>
                <Text style={[styles.recTitle, { color: svc.color }]}>{svc.title}</Text>
                <Text style={styles.recNudge}>{svc.nudge}</Text>
              </View>
              <Text style={[styles.recArrow, { color: svc.color }]}>→</Text>
            </TouchableOpacity>
          </Animated.View>

          {recommendations.length > 1 && (
            <View style={styles.dots}>
              {recommendations.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => goToIndex(i)} hitSlop={8}>
                  <View style={[
                    styles.dot,
                    i === currentIndex && styles.dotActive,
                    i === currentIndex && { backgroundColor: svc.color },
                  ]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {donutSegments.length > 0 && (() => {
        const barTotal = donutSegments.reduce((s, seg) => s + seg.value, 0);
        const maxVal = Math.max(...donutSegments.map(s => s.value));
        return (
          <View style={[styles.section, { marginBottom: 24 }]}>
            <Text style={styles.sectionTitle}>Asset Allocation</Text>
            {donutSegments.map((seg, i) => {
              const rawPct = (seg.value / barTotal) * 100;
              const pct = rawPct < 1 ? '<1' : Math.round(rawPct);
              const barWidth = (seg.value / maxVal) * 100;
              return (
                <View key={i} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: seg.color, marginRight: 7 }} />
                      <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>{seg.label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>{fmt(seg.value)}</Text>
                      <View style={{ backgroundColor: seg.color + '22', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: seg.color }}>{pct}%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 4 }}>
                    <View style={{ height: 8, width: `${barWidth}%`, backgroundColor: seg.color, borderRadius: 4 }} />
                  </View>
                </View>
              );
            })}
          </View>
        );
      })()}

      {liabilitiesByType.length > 0 && (() => {
        const LIABILITY_COLORS = { short_term: '#ef4444', long_term: '#6366f1' };
        const LIABILITY_LABELS = { short_term: 'Short-Term', long_term: 'Long-Term' };
        const liabTotal = liabilitiesByType.reduce((s, [, v]) => s + parseFloat(v), 0);
        const liabMax = Math.max(...liabilitiesByType.map(([, v]) => parseFloat(v)));
        return (
          <View style={[styles.section, { marginBottom: 24 }]}>
            <Text style={styles.sectionTitle}>Liability Breakdown</Text>
            {liabilitiesByType.map(([type, value]) => {
              const val = parseFloat(value);
              const rawPct = (val / liabTotal) * 100;
              const pct = rawPct < 1 ? '<1' : Math.round(rawPct);
              const barWidth = (val / liabMax) * 100;
              const color = LIABILITY_COLORS[type] || '#9ca3af';
              const label = LIABILITY_LABELS[type] || fmtLabel(type);
              return (
                <View key={type} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, marginRight: 7 }} />
                      <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>{label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>{fmt(val)}</Text>
                      <View style={{ backgroundColor: color + '22', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color }}>{pct}%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ height: 8, backgroundColor: '#f3f4f6', borderRadius: 4 }}>
                    <View style={{ height: 8, width: `${barWidth}%`, backgroundColor: color, borderRadius: 4 }} />
                  </View>
                </View>
              );
            })}
          </View>
        );
      })()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 20 },
  error: { color: '#ef4444', textAlign: 'center', marginBottom: 16 },
  netWorthCard: {
    borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 16,
  },
  positive: { backgroundColor: '#1d4ed8' },
  negative: { backgroundColor: '#dc2626' },
  netWorthLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  netWorthValue: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 6 },
  netWorthSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  netWorthDelta: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  deltaPos: { color: 'rgba(134,239,172,1)' },
  deltaNeg: { color: 'rgba(252,165,165,1)' },
  trendWrap: { marginTop: 12, opacity: 0.9 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 18 },
  cardGreen: { backgroundColor: '#dcfce7' },
  cardRed: { backgroundColor: '#fee2e2' },
  cardLabel: { fontSize: 12, color: '#374151', marginBottom: 6 },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // Carousel
  recsSection: { marginBottom: 24 },
  recsSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  recCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recIconBox: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 14, flexShrink: 0,
  },
  recIcon: { fontSize: 24 },
  recTextBox: { flex: 1 },
  recTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  recNudge: { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  recArrow: { fontSize: 20, fontWeight: '700', marginLeft: 10 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d1d5db' },
  dotActive: { width: 20 },

  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
});
