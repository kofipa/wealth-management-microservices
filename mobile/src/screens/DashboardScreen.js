import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getNetWorthBreakdown } from '../api/client';
import { useAuth } from '../context/AuthContext';

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const fmtLabel = (s) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function DashboardScreen() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setError(null);
      const res = await getNetWorthBreakdown();
      setData(res.data);
    } catch (err) {
      setError('Could not load net worth data');
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

  // API returns: { netWorth, totalAssets, totalLiabilities, assetsByType, liabilitiesByType }
  const netWorth = data?.netWorth ?? 0;
  const totalAssets = data?.totalAssets ?? 0;
  const totalLiabilities = data?.totalLiabilities ?? 0;
  const isPositive = netWorth >= 0;
  const assetsByType = data?.assetsByType ? Object.entries(data.assetsByType) : [];
  const liabilitiesByType = data?.liabilitiesByType ? Object.entries(data.liabilitiesByType) : [];

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
        <Text style={styles.netWorthSub}>{isPositive ? 'Assets exceed liabilities' : 'Liabilities exceed assets'}</Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, styles.cardGreen]}>
          <Text style={styles.cardLabel}>Total Assets</Text>
          <Text style={styles.cardValue}>{fmt(totalAssets)}</Text>
        </View>
        <View style={[styles.card, styles.cardRed]}>
          <Text style={styles.cardLabel}>Total Liabilities</Text>
          <Text style={styles.cardValue}>{fmt(totalLiabilities)}</Text>
        </View>
      </View>

      {assetsByType.length > 0 && (
        <View style={[styles.section, { marginBottom: 16 }]}>
          <Text style={styles.sectionTitle}>Asset Breakdown</Text>
          {assetsByType.map(([type, value]) => (
            <View key={type} style={styles.breakdownRow}>
              <Text style={styles.breakdownType}>{fmtLabel(type)}</Text>
              <Text style={styles.breakdownValue}>{fmt(value)}</Text>
            </View>
          ))}
        </View>
      )}

      {liabilitiesByType.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Liability Breakdown</Text>
          {liabilitiesByType.map(([type, value]) => (
            <View key={type} style={styles.breakdownRow}>
              <Text style={styles.breakdownType}>{fmtLabel(type)}</Text>
              <Text style={[styles.breakdownValue, styles.breakdownValueRed]}>{fmt(value)}</Text>
            </View>
          ))}
        </View>
      )}
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
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 20,
  },
  positive: { backgroundColor: '#1d4ed8' },
  negative: { backgroundColor: '#dc2626' },
  netWorthLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  netWorthValue: { fontSize: 40, fontWeight: '800', color: '#fff', marginBottom: 6 },
  netWorthSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  card: { flex: 1, borderRadius: 12, padding: 18 },
  cardGreen: { backgroundColor: '#dcfce7' },
  cardRed: { backgroundColor: '#fee2e2' },
  cardLabel: { fontSize: 12, color: '#374151', marginBottom: 6 },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#111827' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  breakdownType: { fontSize: 14, color: '#374151' },
  breakdownValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  breakdownValueRed: { color: '#ef4444' },
});
