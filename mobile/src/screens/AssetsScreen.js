import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { getAssets, createAsset, updateAsset, deleteAsset, uploadDocument, createLiability, updateLiability, deleteLiability, getOpenBankingAuthUrl, getOpenBankingStatus, getOpenBankingAccounts, getPropertyValuation, getStockQuote, getVehicleValuation } from '../api/client';
import DatePickerField from '../components/DatePickerField';
import { useTheme } from '../context/ThemeContext';

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const ASSET_TYPES = ['cash', 'investment', 'property', 'vehicle', 'insurance', 'other'];

const EMPTY_FORM = { name: '', type: 'cash', value: '', description: '', metadata: {} };

export default function AssetsScreen() {
  const [assets, setAssets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('value_desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingAsset, setEditingAsset] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [bankConnected, setBankConnected] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedAccounts, setSelectedAccounts] = useState({});
  const [importingBank, setImportingBank] = useState(false);
  const [valuations, setValuations] = useState({}); // { [assetId]: { value, count, loading, error } }
  const [quotes, setQuotes] = useState({}); // { [assetId]: { name, price_gbp, exchange, loading, error } }
  const [vehicleVals, setVehicleVals] = useState({}); // { [assetId]: { estimated_value, make, year, loading, error } }
  const editingAssetIdRef = useRef(null); // tracks which asset is open in edit modal

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const load = async () => {
    try {
      const [assetsRes, statusRes] = await Promise.allSettled([
        getAssets(),
        getOpenBankingStatus(),
      ]);
      if (assetsRes.status === 'fulfilled') {
        const loaded = assetsRes.value.data.assets || [];
        setAssets(loaded);
        loaded.filter(a => a.asset_type === 'property').forEach(a => {
          const pc = extractPostcode(a.metadata?.address);
          if (pc) fetchValuation(a.id, pc);
        });
        loaded.filter(a => a.asset_type === 'investment' && a.metadata?.ticker_symbol && a.metadata?.quantity)
          .forEach(a => fetchQuote(a.id, a.metadata.ticker_symbol, a.metadata.quantity));
        loaded.filter(a => a.metadata?.original_type === 'vehicle' && a.metadata?.reg_plate && a.metadata?.purchase_price && a.metadata?.purchase_date)
          .forEach(a => fetchVehicleValuation(a.id, a.metadata.reg_plate, a.metadata.purchase_price, a.metadata.purchase_date));
      } else Alert.alert('Error', 'Could not load assets');
      if (statusRes.status === 'fulfilled') setBankConnected(statusRes.value.data.connected);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  // Update a single metadata key without replacing the whole object
  const setMeta = (key, val) =>
    setForm((prev) => ({ ...prev, metadata: { ...prev.metadata, [key]: val } }));

  // Toggle a value in a metadata array field (for multi-select chips)
  const toggleMeta = (key, val) =>
    setForm((prev) => {
      const arr = Array.isArray(prev.metadata[key]) ? prev.metadata[key] : [];
      const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
      return { ...prev, metadata: { ...prev.metadata, [key]: next } };
    });

  const extractPostcode = (address) => {
    const m = (address || '').match(/[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}/i);
    return m ? m[0].toUpperCase() : null;
  };

  const fetchValuation = async (assetId, postcode) => {
    setValuations(prev => ({ ...prev, [assetId]: { loading: true } }));
    try {
      const { data } = await getPropertyValuation(postcode);
      setValuations(prev => ({
        ...prev,
        [assetId]: { value: data.estimated_value, count: data.comparables_count, loading: false },
      }));
      if (data.estimated_value != null) {
        await updateAsset(assetId, { value: data.estimated_value });
        setAssets(prev => prev.map(a => a.id === assetId ? { ...a, value: data.estimated_value } : a));
        if (editingAssetIdRef.current === assetId) {
          setForm(prev => ({ ...prev, value: String(data.estimated_value) }));
        }
      }
    } catch {
      setValuations(prev => ({ ...prev, [assetId]: { loading: false, error: true } }));
    }
  };

  const fetchQuote = async (assetId, ticker, quantity) => {
    setQuotes(prev => ({ ...prev, [assetId]: { loading: true } }));
    try {
      const { data } = await getStockQuote(ticker);
      const value = data.price_gbp * parseFloat(quantity);
      setQuotes(prev => ({
        ...prev,
        [assetId]: { name: data.name, price_gbp: data.price_gbp, exchange: data.exchange, loading: false },
      }));
      await updateAsset(assetId, { value });
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, value } : a));
      if (editingAssetIdRef.current === assetId) {
        setForm(prev => ({ ...prev, value: String(value) }));
      }
    } catch {
      setQuotes(prev => ({ ...prev, [assetId]: { loading: false, error: true } }));
    }
  };

  const fetchVehicleValuation = async (assetId, reg, purchase_price, purchase_date) => {
    setVehicleVals(prev => ({ ...prev, [assetId]: { loading: true } }));
    try {
      const { data } = await getVehicleValuation(reg, purchase_price, purchase_date);
      setVehicleVals(prev => ({
        ...prev,
        [assetId]: { estimated_value: data.estimated_value, make: data.make, year: data.year_of_manufacture, loading: false },
      }));
      await updateAsset(assetId, { value: data.estimated_value });
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, value: data.estimated_value } : a));
      if (editingAssetIdRef.current === assetId) {
        setForm(prev => ({ ...prev, value: String(data.estimated_value) }));
      }
    } catch {
      setVehicleVals(prev => ({ ...prev, [assetId]: { loading: false, error: true } }));
    }
  };

  const openAddModal = () => {
    setEditingAsset(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (asset) => {
    editingAssetIdRef.current = asset.id;
    setEditingAsset(asset);
    setForm({
      name: asset.name,
      type: asset.metadata?.original_type || asset.asset_type,
      value: String(asset.value),
      description: asset.description || '',
      metadata: asset.metadata || {},
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    editingAssetIdRef.current = null;
    setModalVisible(false);
    setEditingAsset(null);
    setForm(EMPTY_FORM);
    setPendingFile(null);
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setPendingFile({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream' });
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      setPendingFile({ uri: a.uri, name: a.fileName || `photo_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
    }
  };

  const showFilePicker = () => {
    Alert.alert('Attach Document', 'Choose source', [
      { text: 'Photo Library', onPress: pickFromGallery },
      { text: 'Browse Files', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    if (!form.name || !form.value) {
      Alert.alert('Error', 'Name and value are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        value: parseFloat(form.value),
        description: form.description,
        metadata: { ...form.metadata, original_type: form.type },
      };
      let savedAsset;
      if (editingAsset) {
        const res = await updateAsset(editingAsset.id, payload);
        savedAsset = res.data.asset;
      } else {
        const res = await createAsset(payload);
        savedAsset = res.data.asset;
      }
      if (pendingFile && savedAsset?.id) {
        const docCategory = { cash: 'banking', investment: 'investments', property: 'property', insurance: 'insurance' }[form.type] || 'other';
        try {
          await uploadDocument(pendingFile, form.name, 'asset', savedAsset.id, docCategory);
        } catch {
          Alert.alert('Warning', 'Asset saved but document upload failed.');
        }
      }

      // ── Mortgage liability sync ──
      if (form.type === 'property') {
        const hasMortgage = form.metadata.has_mortgage === true;
        const mortgageBalance = parseFloat(form.metadata.mortgage_balance) || 0;
        const mortgagePayment = parseFloat(form.metadata.mortgage_payment) || 0;
        const existingLiabilityId = editingAsset?.metadata?.mortgage_liability_id;

        if (hasMortgage && mortgageBalance > 0) {
          const freq = form.metadata.mortgage_frequency || 'Monthly';
          const multiplier = { Monthly: 12, Fortnightly: 26, Annually: 1 }[freq] ?? 12;
          const descParts = [
            form.metadata.mortgage_provider ? `Mortgage with ${form.metadata.mortgage_provider}` : '',
            mortgagePayment > 0
              ? `£${mortgagePayment} paid ${freq.toLowerCase()} (£${(mortgagePayment * multiplier).toFixed(2)}/yr)`
              : '',
          ].filter(Boolean);
          const liabilityPayload = {
            name: `Mortgage - ${form.name}`,
            type: 'long-term',
            amount: mortgageBalance,
            ...(descParts.length ? { description: descParts.join(', ') } : {}),
            ...(form.metadata.mortgage_rate ? { interest_rate: parseFloat(form.metadata.mortgage_rate) } : {}),
          };
          if (existingLiabilityId) {
            // Update the existing linked liability
            try {
              await updateLiability(existingLiabilityId, liabilityPayload);
            } catch {
              Alert.alert('Warning', 'Asset saved but mortgage liability could not be updated.');
            }
          } else {
            // Create a new liability and store the ID back on the asset
            try {
              const liabilityRes = await createLiability(liabilityPayload);
              const liabilityId = liabilityRes.data.liability?.id;
              if (liabilityId) {
                await updateAsset(savedAsset.id, {
                  metadata: { ...savedAsset.metadata, mortgage_liability_id: liabilityId },
                });
              }
            } catch {
              Alert.alert('Warning', 'Asset saved but mortgage liability could not be created.');
            }
          }
        } else if (!hasMortgage && existingLiabilityId) {
          // Mortgage removed — delete the linked liability
          try {
            await deleteLiability(existingLiabilityId);
            await updateAsset(savedAsset.id, {
              metadata: { ...savedAsset.metadata, mortgage_liability_id: null },
            });
          } catch {
            Alert.alert('Warning', 'Asset saved but linked mortgage liability could not be removed.');
          }
        }
      }

      // ── Vehicle finance liability sync ──
      if (form.type === 'vehicle') {
        const hasFinance = form.metadata.has_finance === true;
        const financeBalance = parseFloat(form.metadata.finance_balance) || 0;
        const financePayment = parseFloat(form.metadata.finance_payment) || 0;
        const existingFinanceLiabilityId = editingAsset?.metadata?.finance_liability_id;
        const liabilityType = form.metadata.finance_type === 'Personal Loan' ? 'short-term' : 'long-term';

        if (hasFinance && financeBalance > 0) {
          const freq = form.metadata.finance_frequency || 'Monthly';
          const multiplier = { Monthly: 12, Quarterly: 4, Annually: 1 }[freq] ?? 12;
          const descParts = [
            form.metadata.finance_provider ? `Finance with ${form.metadata.finance_provider}` : '',
            financePayment > 0
              ? `£${financePayment} paid ${freq.toLowerCase()} (£${(financePayment * multiplier).toFixed(2)}/yr)`
              : '',
          ].filter(Boolean);
          const liabilityPayload = {
            name: `${form.metadata.finance_type || 'Finance'} - ${form.name}`,
            type: liabilityType,
            amount: financeBalance,
            ...(descParts.length ? { description: descParts.join(', ') } : {}),
            ...(form.metadata.finance_rate ? { interest_rate: parseFloat(form.metadata.finance_rate) } : {}),
          };
          if (existingFinanceLiabilityId) {
            try {
              await updateLiability(existingFinanceLiabilityId, liabilityPayload);
            } catch {
              Alert.alert('Warning', 'Asset saved but finance liability could not be updated.');
            }
          } else {
            try {
              const liabilityRes = await createLiability(liabilityPayload);
              const liabilityId = liabilityRes.data.liability?.id;
              if (liabilityId) {
                await updateAsset(savedAsset.id, {
                  metadata: { ...savedAsset.metadata, finance_liability_id: liabilityId },
                });
              }
            } catch {
              Alert.alert('Warning', 'Asset saved but finance liability could not be created.');
            }
          }
        } else if (!hasFinance && existingFinanceLiabilityId) {
          try {
            await deleteLiability(existingFinanceLiabilityId);
            await updateAsset(savedAsset.id, {
              metadata: { ...savedAsset.metadata, finance_liability_id: null },
            });
          } catch {
            Alert.alert('Warning', 'Asset saved but linked finance liability could not be removed.');
          }
        }
      }

      // ── Insurance premium liability sync ──
      if (form.type === 'insurance') {
        const premiumAmount = parseFloat(form.metadata.premium);
        const hasPremium = premiumAmount > 0;
        const existingInsuranceLiabilityId = editingAsset?.metadata?.insurance_liability_id;

        if (hasPremium) {
          const freq = form.metadata.premium_frequency || 'Monthly';
          const multiplier = { Monthly: 12, Quarterly: 4, Annually: 1 }[freq] ?? 12;
          const annualCost = premiumAmount * multiplier;
          const descParts = [
            form.metadata.policy_type,
            form.metadata.insurer ? `with ${form.metadata.insurer}` : '',
            `£${premiumAmount} paid ${freq.toLowerCase()} (£${annualCost.toFixed(2)}/yr)`,
          ].filter(Boolean);
          const liabilityPayload = {
            name: `Insurance Premium - ${form.name}`,
            type: 'short-term',
            amount: annualCost,
            description: descParts.join(', '),
            ...(form.metadata.renewal_date ? { due_date: form.metadata.renewal_date } : {}),
          };
          if (existingInsuranceLiabilityId) {
            try {
              await updateLiability(existingInsuranceLiabilityId, liabilityPayload);
            } catch {
              Alert.alert('Warning', 'Asset saved but insurance premium liability could not be updated.');
            }
          } else {
            try {
              const liabilityRes = await createLiability(liabilityPayload);
              const liabilityId = liabilityRes.data.liability?.id;
              if (liabilityId) {
                await updateAsset(savedAsset.id, {
                  metadata: { ...savedAsset.metadata, insurance_liability_id: liabilityId },
                });
              }
            } catch {
              Alert.alert('Warning', 'Asset saved but insurance premium liability could not be created.');
            }
          }
        } else if (!hasPremium && existingInsuranceLiabilityId) {
          try {
            await deleteLiability(existingInsuranceLiabilityId);
            await updateAsset(savedAsset.id, {
              metadata: { ...savedAsset.metadata, insurance_liability_id: null },
            });
          } catch {
            Alert.alert('Warning', 'Asset saved but linked insurance premium liability could not be removed.');
          }
        }
      }

      closeModal();
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save asset');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    Alert.alert('Delete Asset', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteAsset(id);
            load();
          } catch {
            Alert.alert('Error', 'Could not delete asset');
          }
        },
      },
    ]);
  };

  const handleConnectBank = async () => {
    try {
      const { data } = await getOpenBankingAuthUrl();
      // Backend handles the code exchange; success page tries wealthmanager:// for iOS,
      // but we always check status after the browser closes as a fallback for Expo Go.
      await WebBrowser.openAuthSessionAsync(data.url, 'wealthmanager://openbanking/success');
      // Check actual connection status regardless of how the browser was dismissed
      const statusRes = await getOpenBankingStatus();
      if (statusRes.data.connected) {
        setBankConnected(true);
        handleImportAccounts();
      }
    } catch {
      Alert.alert('Error', 'Could not connect to bank. Make sure the bank service is running.');
    }
  };

  const handleImportAccounts = async () => {
    try {
      setImportingBank(true);
      const { data } = await getOpenBankingAccounts();
      const accounts = data.accounts || [];
      setBankAccounts(accounts);
      const sel = {};
      accounts.forEach((a) => { sel[a.account_id] = true; });
      setSelectedAccounts(sel);
      setImportModalVisible(true);
    } catch {
      Alert.alert('Error', 'Could not fetch bank accounts. Please try again.');
    } finally {
      setImportingBank(false);
    }
  };

  const handleImportConfirm = async () => {
    const toImport = bankAccounts.filter((a) => selectedAccounts[a.account_id]);
    if (toImport.length === 0) {
      setImportModalVisible(false);
      return;
    }
    try {
      setSaving(true);
      for (const acct of toImport) {
        await createAsset({
          name: acct.display_name,
          type: 'cash',
          value: acct.balance,
          description: `Imported via Open Banking`,
          metadata: {
            source: 'truelayer',
            account_id: acct.account_id,
            institution: acct.provider,
            account_type: acct.account_type,
            currency: acct.currency,
          },
        });
      }
      setImportModalVisible(false);
      load();
      Alert.alert('Done', `Imported ${toImport.length} account${toImport.length !== 1 ? 's' : ''}`);
    } catch {
      Alert.alert('Error', 'Failed to import some accounts');
    } finally {
      setSaving(false);
    }
  };

  const getMetaSummary = (item) => {
    const m = item.metadata || {};
    switch (item.asset_type) {
      case 'cash':
        return m.institution
          ? <Text style={styles.itemDesc}>{m.institution}{m.account_type ? ` · ${m.account_type}` : ''}</Text>
          : null;
      case 'investment': {
        const itypes = Array.isArray(m.investment_type) ? m.investment_type.join(', ') : m.investment_type;
        return m.platform
          ? <Text style={styles.itemDesc}>{m.platform}{itypes ? ` · ${itypes}` : ''}</Text>
          : null;
      }
      case 'property':
        return m.address ? <Text style={styles.itemDesc}>{m.address}</Text> : null;
      case 'insurance': {
        const ptypes = Array.isArray(m.policy_type) ? m.policy_type.join(', ') : m.policy_type;
        return m.insurer
          ? <Text style={styles.itemDesc}>{m.insurer}{ptypes ? ` · ${ptypes}` : ''}</Text>
          : null;
      }
      default:
        return m.category ? <Text style={styles.itemDesc}>{m.category}</Text> : null;
    }
  };

  const totalValue = assets.reduce((sum, a) => sum + parseFloat(a.value || 0), 0);

  const filteredAssets = assets
    .filter(a => {
      const q = searchQuery.toLowerCase();
      return !q || a.name?.toLowerCase().includes(q) || a.asset_type?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'value_desc') return parseFloat(b.value || 0) - parseFloat(a.value || 0);
      if (sortBy === 'value_asc') return parseFloat(a.value || 0) - parseFloat(b.value || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'type') return (a.asset_type || '').localeCompare(b.asset_type || '');
      return 0;
    });

  const SORT_OPTIONS = [
    { key: 'value_desc', label: 'Value', arrow: ' ↓' },
    { key: 'value_asc',  label: 'Value', arrow: ' ↑' },
    { key: 'name',       label: 'Name' },
    { key: 'type',       label: 'Type' },
  ];

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.totalLabel}>Total Assets</Text>
          <Text style={styles.totalValue}>{fmt(totalValue)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.connectBankBtn}
        onPress={bankConnected ? handleImportAccounts : handleConnectBank}
        disabled={importingBank}
      >
        <Text style={styles.connectBankBtnText}>
          {importingBank ? 'Loading...' : bankConnected ? '🏦 Import from Bank' : '🔗 Connect Bank'}
        </Text>
      </TouchableOpacity>

      {/* Search + sort — only useful with more than one item */}
      {assets.length > 1 && (
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search assets…"
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>
      )}

      {assets.length > 1 && (
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
            onPress={() => setSortBy(opt.key)}
          >
            <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>
              {opt.label}
              {opt.arrow && (
                <Text style={{ color: '#f59e0b', fontWeight: '800' }}>{opt.arrow}</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      )}

      <FlatList
        data={filteredAssets}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          assets.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>💰</Text>
              <Text style={styles.emptyTitle}>No assets yet</Text>
              <Text style={styles.emptyBody}>Add your first asset to start tracking your wealth</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openAddModal}>
                <Text style={styles.emptyBtnText}>Add Asset</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.empty}>No assets match your search</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemLeft}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemType}>{item.asset_type}</Text>
              {getMetaSummary(item)}
              {item.asset_type === 'property' && (() => {
                const v = valuations[item.id];
                const postcode = extractPostcode(item.metadata?.address);
                if (!postcode) return null;
                return (
                  <View style={styles.valuationRow}>
                    {v?.loading
                      ? <Text style={styles.valuationError}>Updating value…</Text>
                      : v?.error
                      ? <Text style={styles.valuationError}>Valuation unavailable</Text>
                      : v?.value != null
                      ? <Text style={styles.valuationError}>
                          Land Registry · {v.count} nearby sale{v.count !== 1 ? 's' : ''}
                        </Text>
                      : v
                      ? <Text style={styles.valuationError}>No recent sales data</Text>
                      : null
                    }
                    {!v?.loading && (
                      <TouchableOpacity onPress={() => fetchValuation(item.id, postcode)} style={styles.refreshBtn}>
                        <Text style={styles.refreshIcon}>↻</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
              {item.asset_type === 'investment' && (() => {
                const q = quotes[item.id];
                const ticker = item.metadata?.ticker_symbol;
                const qty = item.metadata?.quantity;
                if (!ticker || !qty) return null;
                return (
                  <View style={styles.valuationRow}>
                    {q?.loading
                      ? <Text style={styles.valuationError}>Fetching price…</Text>
                      : q?.error
                      ? <Text style={styles.valuationError}>Price unavailable</Text>
                      : q?.price_gbp != null
                      ? <Text style={styles.valuationError}>
                          {fmt(q.price_gbp)} × {qty} · {q.exchange || 'Live'}
                        </Text>
                      : null
                    }
                    {!q?.loading && (
                      <TouchableOpacity onPress={() => fetchQuote(item.id, ticker, qty)} style={styles.refreshBtn}>
                        <Text style={styles.refreshIcon}>↻</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
              {item.metadata?.original_type === 'vehicle' && (() => {
                const vv = vehicleVals[item.id];
                const reg = item.metadata?.reg_plate;
                const pp = item.metadata?.purchase_price;
                const pd = item.metadata?.purchase_date;
                if (!reg || !pp || !pd) return null;
                const label = vv?.make
                  ? `${vv.make}${vv.year ? ` ${vv.year}` : ''} · 15%/yr depreciation`
                  : '15%/yr depreciation estimate';
                return (
                  <View style={styles.valuationRow}>
                    {vv?.loading
                      ? <Text style={styles.valuationError}>Estimating value…</Text>
                      : vv?.error
                      ? <Text style={styles.valuationError}>Valuation unavailable</Text>
                      : vv?.estimated_value != null
                      ? <Text style={styles.valuationError}>{label}</Text>
                      : null
                    }
                    {!vv?.loading && (
                      <TouchableOpacity onPress={() => fetchVehicleValuation(item.id, reg, pp, pd)} style={styles.refreshBtn}>
                        <Text style={styles.refreshIcon}>↻</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemValue}>{fmt(item.value)}</Text>
              <View style={styles.itemActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* ── Bank Import Modal ── */}
      <Modal visible={importModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={[styles.modalContent, { paddingBottom: 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import Accounts</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 16, fontSize: 14 }}>
              Select accounts to import as cash assets:
            </Text>
            {bankAccounts.map((acct) => {
              const selected = !!selectedAccounts[acct.account_id];
              return (
                <TouchableOpacity
                  key={acct.account_id}
                  style={styles.accountRow}
                  onPress={() => setSelectedAccounts((prev) => ({ ...prev, [acct.account_id]: !prev[acct.account_id] }))}
                >
                  <View style={[styles.accountCheck, selected && { backgroundColor: colors.primary }]}>
                    {selected && <Text style={{ color: colors.surface, fontSize: 14, fontWeight: '700' }}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{acct.display_name}</Text>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>{acct.provider} · {acct.account_type}</Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#16a34a' }}>
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: acct.currency || 'GBP' }).format(acct.balance)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {bankAccounts.length === 0 && (
              <Text style={{ textAlign: 'center', color: colors.textTertiary, marginTop: 40 }}>No accounts found</Text>
            )}
          </View>
          <View style={{ padding: 24, paddingTop: 0 }}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleImportConfirm} disabled={saving}>
              {saving
                ? <ActivityIndicator color={colors.surface} />
                : <Text style={styles.saveBtnText}>
                    Import {Object.values(selectedAccounts).filter(Boolean).length} Account{Object.values(selectedAccounts).filter(Boolean).length !== 1 ? 's' : ''}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingAsset ? 'Edit Asset' : 'Add Asset'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Savings Account"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {ASSET_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, form.type === t && styles.typeChipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, type: t, metadata: {} }))}
                >
                  <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Value (GBP) *</Text>
            <TextInput
              style={styles.input}
              value={form.value}
              onChangeText={(v) => setForm({ ...form, value: v })}
              placeholder="0.00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(v) => setForm({ ...form, description: v })}
              placeholder="Optional notes"
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
            />

            {/* ── Cash fields ── */}
            {form.type === 'cash' && (
              <>
                <Text style={styles.sectionLabel}>Bank Details</Text>
                <Text style={styles.label}>Bank / Institution</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.institution || ''}
                  onChangeText={(v) => setMeta('institution', v)}
                  placeholder="e.g. Barclays"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Account Type</Text>
                <View style={styles.typeRow}>
                  {['current', 'savings', 'ISA', 'other'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, form.metadata.account_type === t && styles.typeChipActive]}
                      onPress={() => setMeta('account_type', t)}
                    >
                      <Text style={[styles.typeChipText, form.metadata.account_type === t && styles.typeChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Interest Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.interest_rate !== undefined ? String(form.metadata.interest_rate) : ''}
                  onChangeText={(v) => setMeta('interest_rate', v)}
                  placeholder="e.g. 4.5"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
              </>
            )}

            {/* ── Investment fields ── */}
            {form.type === 'investment' && (
              <>
                <Text style={styles.sectionLabel}>Investment Details</Text>
                <Text style={styles.label}>Platform / Broker</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.platform || ''}
                  onChangeText={(v) => setMeta('platform', v)}
                  placeholder="e.g. Vanguard, Hargreaves Lansdown"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Investment Type <Text style={styles.multiHint}>(select all that apply)</Text></Text>
                <View style={styles.typeRow}>
                  {['stocks', 'bonds', 'crypto', 'pension', 'ISA', 'funds'].map((t) => {
                    const active = (Array.isArray(form.metadata.investment_type) ? form.metadata.investment_type : []).includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => toggleMeta('investment_type', t)}
                      >
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.label}>Ticker Symbol (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.ticker_symbol || ''}
                  onChangeText={(v) => setMeta('ticker_symbol', v.toUpperCase())}
                  placeholder="e.g. VWRL"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="characters"
                />
                <Text style={styles.label}>Quantity / Units</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.quantity !== undefined ? String(form.metadata.quantity) : ''}
                  onChangeText={(v) => setMeta('quantity', v)}
                  placeholder="e.g. 100"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Purchase Price Per Unit (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_price !== undefined ? String(form.metadata.purchase_price) : ''}
                  onChangeText={(v) => setMeta('purchase_price', v)}
                  placeholder="e.g. 85.50"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <DatePickerField
                  label="Purchase Date"
                  value={form.metadata.purchase_date || ''}
                  onChange={(v) => setMeta('purchase_date', v)}
                />
              </>
            )}

            {/* ── Property fields ── */}
            {form.type === 'property' && (
              <>
                <Text style={styles.sectionLabel}>Property Details</Text>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.metadata.address || ''}
                  onChangeText={(v) => setMeta('address', v)}
                  placeholder="Full property address"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  numberOfLines={3}
                />
                <Text style={styles.label}>Property Type</Text>
                <View style={styles.typeRow}>
                  {['residential', 'commercial', 'land'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, form.metadata.property_type === t && styles.typeChipActive]}
                      onPress={() => setMeta('property_type', t)}
                    >
                      <Text style={[styles.typeChipText, form.metadata.property_type === t && styles.typeChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Purchase Price (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_price !== undefined ? String(form.metadata.purchase_price) : ''}
                  onChangeText={(v) => setMeta('purchase_price', v)}
                  placeholder="e.g. 250000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <DatePickerField
                  label="Purchase Date"
                  value={form.metadata.purchase_date || ''}
                  onChange={(v) => setMeta('purchase_date', v)}
                />
                <Text style={styles.label}>Has Mortgage?</Text>
                <View style={styles.typeRow}>
                  {['Yes', 'No'].map((opt) => {
                    const isYes = opt === 'Yes';
                    const active = form.metadata.has_mortgage === isYes;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => setMeta('has_mortgage', isYes)}
                      >
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {form.metadata.has_mortgage === true && (
                  <>
                    <Text style={styles.label}>Mortgage Provider</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_provider || ''}
                      onChangeText={(v) => setMeta('mortgage_provider', v)}
                      placeholder="e.g. Halifax"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="words"
                    />
                    <Text style={styles.label}>Mortgage Balance (£)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_balance !== undefined ? String(form.metadata.mortgage_balance) : ''}
                      onChangeText={(v) => setMeta('mortgage_balance', v)}
                      placeholder="e.g. 150000"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.label}>Mortgage Rate (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_rate !== undefined ? String(form.metadata.mortgage_rate) : ''}
                      onChangeText={(v) => setMeta('mortgage_rate', v)}
                      placeholder="e.g. 2.99"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.label}>Monthly Payment (£)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_payment !== undefined ? String(form.metadata.mortgage_payment) : ''}
                      onChangeText={(v) => setMeta('mortgage_payment', v)}
                      placeholder="e.g. 1200"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.label}>Payment Frequency</Text>
                    <View style={styles.typeRow}>
                      {['Monthly', 'Fortnightly', 'Annually'].map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.typeChip, form.metadata.mortgage_frequency === t && styles.typeChipActive]}
                          onPress={() => setMeta('mortgage_frequency', t)}
                        >
                          <Text style={[styles.typeChipText, form.metadata.mortgage_frequency === t && styles.typeChipTextActive]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* ── Vehicle / Other fields ── */}
            {(form.type === 'vehicle' || form.type === 'other') && (
              <>
                <Text style={styles.sectionLabel}>Details</Text>
                <Text style={styles.label}>Category</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.category || ''}
                  onChangeText={(v) => setMeta('category', v)}
                  placeholder={form.type === 'vehicle' ? 'e.g. Car, Motorcycle' : 'e.g. Jewellery, Art'}
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
                {form.type === 'vehicle' && (
                  <>
                    <Text style={styles.label}>Registration Plate</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.reg_plate || ''}
                      onChangeText={(v) => setMeta('reg_plate', v.toUpperCase())}
                      placeholder="e.g. AA19 AAA"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="characters"
                    />
                  </>
                )}
                <Text style={styles.label}>Purchase Price (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_price !== undefined ? String(form.metadata.purchase_price) : ''}
                  onChangeText={(v) => setMeta('purchase_price', v)}
                  placeholder="e.g. 15000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <DatePickerField
                  label="Purchase Date"
                  value={form.metadata.purchase_date || ''}
                  onChange={(v) => setMeta('purchase_date', v)}
                />
                {form.type === 'vehicle' && (
                  <>
                    <Text style={styles.label}>Has Finance?</Text>
                    <View style={styles.typeRow}>
                      {['Yes', 'No'].map((opt) => {
                        const isYes = opt === 'Yes';
                        const active = form.metadata.has_finance === isYes;
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.typeChip, active && styles.typeChipActive]}
                            onPress={() => setMeta('has_finance', isYes)}
                          >
                            <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{opt}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {form.metadata.has_finance === true && (
                      <>
                        <Text style={styles.label}>Finance Type</Text>
                        <View style={styles.typeRow}>
                          {['PCP', 'Hire Purchase', 'Personal Loan'].map((t) => (
                            <TouchableOpacity
                              key={t}
                              style={[styles.typeChip, form.metadata.finance_type === t && styles.typeChipActive]}
                              onPress={() => setMeta('finance_type', t)}
                            >
                              <Text style={[styles.typeChipText, form.metadata.finance_type === t && styles.typeChipTextActive]}>{t}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.label}>Finance Provider</Text>
                        <TextInput
                          style={styles.input}
                          value={form.metadata.finance_provider || ''}
                          onChangeText={(v) => setMeta('finance_provider', v)}
                          placeholder="e.g. Black Horse, Santander"
                          placeholderTextColor={colors.placeholder}
                          autoCapitalize="words"
                        />
                        <Text style={styles.label}>Outstanding Balance (£)</Text>
                        <TextInput
                          style={styles.input}
                          value={form.metadata.finance_balance !== undefined ? String(form.metadata.finance_balance) : ''}
                          onChangeText={(v) => setMeta('finance_balance', v)}
                          placeholder="e.g. 8000"
                          placeholderTextColor={colors.placeholder}
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.label}>Periodic Payment (£)</Text>
                        <TextInput
                          style={styles.input}
                          value={form.metadata.finance_payment !== undefined ? String(form.metadata.finance_payment) : ''}
                          onChangeText={(v) => setMeta('finance_payment', v)}
                          placeholder="e.g. 350"
                          placeholderTextColor={colors.placeholder}
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.label}>Payment Frequency</Text>
                        <View style={styles.typeRow}>
                          {['Monthly', 'Quarterly', 'Annually'].map((t) => (
                            <TouchableOpacity
                              key={t}
                              style={[styles.typeChip, form.metadata.finance_frequency === t && styles.typeChipActive]}
                              onPress={() => setMeta('finance_frequency', t)}
                            >
                              <Text style={[styles.typeChipText, form.metadata.finance_frequency === t && styles.typeChipTextActive]}>{t}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <Text style={styles.label}>Interest Rate (%)</Text>
                        <TextInput
                          style={styles.input}
                          value={form.metadata.finance_rate !== undefined ? String(form.metadata.finance_rate) : ''}
                          onChangeText={(v) => setMeta('finance_rate', v)}
                          placeholder="e.g. 6.9"
                          placeholderTextColor={colors.placeholder}
                          keyboardType="decimal-pad"
                        />
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Insurance fields ── */}
            {form.type === 'insurance' && (
              <>
                <Text style={styles.sectionLabel}>Policy Details</Text>
                <Text style={styles.label}>Insurer / Provider</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.insurer || ''}
                  onChangeText={(v) => setMeta('insurer', v)}
                  placeholder="e.g. Aviva, Legal & General"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Policy Type <Text style={styles.multiHint}>(select all that apply)</Text></Text>
                <View style={styles.typeRow}>
                  {['Life', 'Whole of Life', 'Income Protection', 'Critical Illness', 'Buildings', 'Contents', 'Other'].map((t) => {
                    const active = (Array.isArray(form.metadata.policy_type) ? form.metadata.policy_type : []).includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeChip, active && styles.typeChipActive]}
                        onPress={() => toggleMeta('policy_type', t)}
                      >
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.label}>Policy Number</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.policy_number || ''}
                  onChangeText={(v) => setMeta('policy_number', v)}
                  placeholder="e.g. POL-123456"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="characters"
                />
                <Text style={styles.label}>Sum Assured / Coverage (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.sum_assured !== undefined ? String(form.metadata.sum_assured) : ''}
                  onChangeText={(v) => setMeta('sum_assured', v)}
                  placeholder="e.g. 500000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Premium Amount (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.premium !== undefined ? String(form.metadata.premium) : ''}
                  onChangeText={(v) => setMeta('premium', v)}
                  placeholder="e.g. 50"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Premium Frequency</Text>
                <View style={styles.typeRow}>
                  {['Monthly', 'Quarterly', 'Annually'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, form.metadata.premium_frequency === t && styles.typeChipActive]}
                      onPress={() => setMeta('premium_frequency', t)}
                    >
                      <Text style={[styles.typeChipText, form.metadata.premium_frequency === t && styles.typeChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <DatePickerField
                  label="Renewal / Expiry Date"
                  value={form.metadata.renewal_date || ''}
                  onChange={(v) => setMeta('renewal_date', v)}
                />
              </>
            )}

            {/* ── Attach Document ── */}
            <Text style={styles.sectionLabel}>Documents</Text>
            {pendingFile ? (
              <View style={styles.pendingFile}>
                <Text style={styles.pendingFileName} numberOfLines={1}>📎 {pendingFile.name}</Text>
                <TouchableOpacity onPress={() => setPendingFile(null)}>
                  <Text style={styles.removeFile}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.attachBtn} onPress={showFilePicker}>
                <Text style={styles.attachBtnText}>+ Attach a document</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={colors.surface} />
                : <Text style={styles.saveBtnText}>{editingAsset ? 'Save Changes' : 'Add Asset'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  addBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: colors.surface, fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: colors.textTertiary, marginTop: 60, fontSize: 15 },
  item: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border },
  itemLeft: { flex: 1, marginRight: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  itemType: { fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize', marginBottom: 2 },
  itemDesc: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemValue: { fontSize: 16, fontWeight: '700', color: '#16a34a', marginBottom: 6 },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  editBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 16, color: colors.primary },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 13, color: colors.textSecondary, textTransform: 'capitalize' },
  typeChipTextActive: { color: colors.surface },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: colors.surface, fontSize: 16, fontWeight: '600' },
  pendingFile: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.primary },
  pendingFileName: { flex: 1, fontSize: 14, color: colors.primary },
  removeFile: { fontSize: 18, color: colors.textSecondary, paddingLeft: 8 },
  attachBtn: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  attachBtnText: { fontSize: 14, color: colors.textSecondary },
  multiHint: { fontSize: 12, fontWeight: '400', color: colors.textTertiary },
  valuationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  valuationText: { fontSize: 12, color: '#059669', flex: 1 },
  valuationError: { fontSize: 12, color: colors.textTertiary, flex: 1 },
  refreshBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  refreshIcon: { fontSize: 15, color: colors.textSecondary },
  connectBankBtn: { backgroundColor: colors.primaryLight, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: colors.primary },
  connectBankBtnText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  accountCheck: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: colors.primary, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  searchInput: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  sortRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  sortChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  sortChipTextActive: { color: colors.primary, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  emptyBtnText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
});
