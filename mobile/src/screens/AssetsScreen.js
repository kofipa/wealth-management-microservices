import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getAssets, createAsset, updateAsset, deleteAsset, uploadDocument } from '../api/client';

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const ASSET_TYPES = ['cash', 'investment', 'property', 'vehicle', 'other'];

const EMPTY_FORM = { name: '', type: 'cash', value: '', description: '', metadata: {} };

export default function AssetsScreen() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingAsset, setEditingAsset] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);

  const load = async () => {
    try {
      const res = await getAssets();
      setAssets(res.data.assets || []);
    } catch {
      Alert.alert('Error', 'Could not load assets');
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

  const openAddModal = () => {
    setEditingAsset(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (asset) => {
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
        try {
          await uploadDocument(pendingFile, form.name, 'asset', savedAsset.id);
        } catch {
          Alert.alert('Warning', 'Asset saved but document upload failed.');
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

  const getMetaSummary = (item) => {
    const m = item.metadata || {};
    switch (item.asset_type) {
      case 'cash':
        return m.institution
          ? <Text style={styles.itemDesc}>{m.institution}{m.account_type ? ` · ${m.account_type}` : ''}</Text>
          : null;
      case 'investment':
        return m.platform
          ? <Text style={styles.itemDesc}>{m.platform}{m.investment_type ? ` · ${m.investment_type}` : ''}</Text>
          : null;
      case 'property':
        return m.address ? <Text style={styles.itemDesc}>{m.address}</Text> : null;
      default:
        return m.category ? <Text style={styles.itemDesc}>{m.category}</Text> : null;
    }
  };

  const totalValue = assets.reduce((sum, a) => sum + parseFloat(a.value || 0), 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
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

      <FlatList
        data={assets}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No assets yet. Tap + Add to get started.</Text>}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemLeft}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemType}>{item.asset_type}</Text>
              {getMetaSummary(item)}
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemValue}>{fmt(item.value)}</Text>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openEditModal(item)}>
                  <Text style={styles.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

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
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(v) => setForm({ ...form, description: v })}
              placeholder="Optional notes"
              placeholderTextColor="#9ca3af"
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
                  placeholderTextColor="#9ca3af"
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
                  placeholderTextColor="#9ca3af"
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
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Investment Type</Text>
                <View style={styles.typeRow}>
                  {['stocks', 'bonds', 'crypto', 'pension', 'ISA', 'funds'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, form.metadata.investment_type === t && styles.typeChipActive]}
                      onPress={() => setMeta('investment_type', t)}
                    >
                      <Text style={[styles.typeChipText, form.metadata.investment_type === t && styles.typeChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Ticker Symbol (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.ticker_symbol || ''}
                  onChangeText={(v) => setMeta('ticker_symbol', v.toUpperCase())}
                  placeholder="e.g. VWRL"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="characters"
                />
                <Text style={styles.label}>Quantity / Units</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.quantity !== undefined ? String(form.metadata.quantity) : ''}
                  onChangeText={(v) => setMeta('quantity', v)}
                  placeholder="e.g. 100"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Purchase Price Per Unit (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_price !== undefined ? String(form.metadata.purchase_price) : ''}
                  onChangeText={(v) => setMeta('purchase_price', v)}
                  placeholder="e.g. 85.50"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Purchase Date</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_date || ''}
                  onChangeText={(v) => setMeta('purchase_date', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
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
                  placeholderTextColor="#9ca3af"
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
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Purchase Date</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_date || ''}
                  onChangeText={(v) => setMeta('purchase_date', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
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
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="words"
                    />
                    <Text style={styles.label}>Mortgage Balance (£)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_balance !== undefined ? String(form.metadata.mortgage_balance) : ''}
                      onChangeText={(v) => setMeta('mortgage_balance', v)}
                      placeholder="e.g. 150000"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.label}>Mortgage Rate (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.metadata.mortgage_rate !== undefined ? String(form.metadata.mortgage_rate) : ''}
                      onChangeText={(v) => setMeta('mortgage_rate', v)}
                      placeholder="e.g. 2.99"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
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
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="words"
                />
                <Text style={styles.label}>Purchase Price (£)</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_price !== undefined ? String(form.metadata.purchase_price) : ''}
                  onChangeText={(v) => setMeta('purchase_price', v)}
                  placeholder="e.g. 15000"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Purchase Date</Text>
                <TextInput
                  style={styles.input}
                  value={form.metadata.purchase_date || ''}
                  onChangeText={(v) => setMeta('purchase_date', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
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
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>{editingAsset ? 'Save Changes' : 'Add Asset'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  totalLabel: { fontSize: 13, color: '#6b7280' },
  totalValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 15 },
  item: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb' },
  itemLeft: { flex: 1, marginRight: 8 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  itemType: { fontSize: 12, color: '#6b7280', textTransform: 'capitalize', marginBottom: 2 },
  itemDesc: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemValue: { fontSize: 16, fontWeight: '700', color: '#16a34a', marginBottom: 6 },
  itemActions: { flexDirection: 'row', gap: 12 },
  editText: { fontSize: 13, color: '#2563eb' },
  deleteText: { fontSize: 13, color: '#ef4444' },
  modal: { flex: 1, backgroundColor: '#f9fafb' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 16, color: '#2563eb' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  typeChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeChipText: { fontSize: 13, color: '#374151', textTransform: 'capitalize' },
  typeChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pendingFile: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  pendingFileName: { flex: 1, fontSize: 14, color: '#1d4ed8' },
  removeFile: { fontSize: 18, color: '#6b7280', paddingLeft: 8 },
  attachBtn: { borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  attachBtnText: { fontSize: 14, color: '#6b7280' },
});
