import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  getLiabilities, createLiability, updateLiability,
  deleteLiability, uploadDocument,
} from '../api/client';
import DatePickerField from '../components/DatePickerField';
import { useTheme } from '../context/ThemeContext';

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const fmtType = (t) =>
  t ? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

const LIABILITY_TYPES = ['short-term', 'long-term'];

const EMPTY_FORM = {
  name: '', type: 'short-term', amount: '', interest_rate: '', due_date: '', description: '',
};

const SORT_OPTIONS = [
  { key: 'amount_desc', label: 'Amount', arrow: ' ↓' },
  { key: 'amount_asc',  label: 'Amount', arrow: ' ↑' },
  { key: 'name',        label: 'Name' },
  { key: 'type',        label: 'Type' },
];

export default function LiabilitiesScreen() {
  const { colors } = useTheme();
  const [liabilities, setLiabilities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('amount_desc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLiability, setEditingLiability] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLiabilities();
      setLiabilities(res.data.liabilities || []);
    } catch {
      Alert.alert('Error', 'Could not load liabilities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const closeModal = () => {
    setModalVisible(false);
    setEditingLiability(null);
    setPendingFile(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  const openEditModal = (item) => {
    const type = item.liability_type === 'long_term' ? 'long-term' : 'short-term';
    const due = item.due_date ? String(item.due_date).split('T')[0] : '';
    setForm({
      name: item.name || '',
      type,
      amount: String(item.amount || ''),
      interest_rate: item.interest_rate ? String(item.interest_rate) : '',
      due_date: due,
      description: item.description || '',
    });
    setEditingLiability(item);
    setPendingFile(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (!form.amount) errors.amount = 'Amount is required';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        amount: parseFloat(form.amount),
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : undefined,
        due_date: form.due_date || undefined,
        description: form.description,
      };

      let savedLiability;
      if (editingLiability) {
        const res = await updateLiability(editingLiability.id, payload);
        savedLiability = res.data.liability;
      } else {
        const res = await createLiability(payload);
        savedLiability = res.data.liability;
      }

      if (pendingFile && savedLiability?.id) {
        try {
          await uploadDocument(pendingFile, form.name, 'liability', savedLiability.id, 'banking');
        } catch {
          Alert.alert('Warning', 'Liability saved but document upload failed.');
        }
      }

      closeModal();
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save liability');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id, name) => {
    Alert.alert('Delete Liability', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteLiability(id);
            load();
          } catch {
            Alert.alert('Error', 'Could not delete liability');
          }
        },
      },
    ]);
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
      const name = a.fileName || `photo_${Date.now()}.jpg`;
      setPendingFile({ uri: a.uri, name, mimeType: a.mimeType || 'image/jpeg' });
    }
  };

  const showFilePicker = () => {
    Alert.alert('Attach Document', 'Choose source', [
      { text: 'Photo Library', onPress: pickFromGallery },
      { text: 'Browse Files', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const totalAmount = liabilities.reduce((sum, l) => sum + parseFloat(l.amount || 0), 0);

  const filteredLiabilities = liabilities
    .filter(l => {
      const q = searchQuery.toLowerCase();
      return !q || l.name?.toLowerCase().includes(q) || l.liability_type?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'amount_desc') return parseFloat(b.amount || 0) - parseFloat(a.amount || 0);
      if (sortBy === 'amount_asc') return parseFloat(a.amount || 0) - parseFloat(b.amount || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'type') return (a.liability_type || '').localeCompare(b.liability_type || '');
      return 0;
    });

  const styles = makeStyles(colors);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.totalLabel}>Total Liabilities</Text>
          <Text style={styles.totalValue}>{fmt(totalAmount)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {liabilities.length > 1 && (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search liabilities…"
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>

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
                    <Text style={{ color: colors.danger, fontWeight: '800' }}>{opt.arrow}</Text>
                  )}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <FlatList
        data={filteredLiabilities}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          liabilities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>No liabilities yet</Text>
              <Text style={styles.emptyBody}>Track loans, mortgages and other debts to see your true net worth</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
                <Text style={styles.emptyBtnText}>Add Liability</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.empty}>No liabilities match your search</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemTop}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemType}>{fmtType(item.liability_type)}</Text>
                {item.interest_rate ? <Text style={styles.itemMeta}>{item.interest_rate}% interest</Text> : null}
                {item.due_date ? (
                  <Text style={styles.itemMeta}>Due: {String(item.due_date).split('T')[0]}</Text>
                ) : null}
                {item.description ? <Text style={styles.itemMeta}>{item.description}</Text> : null}
              </View>
              <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
            </View>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingLiability ? 'Edit Liability' : 'Add Liability'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={[styles.input, fieldErrors.name && styles.inputError]}
              value={form.name}
              onChangeText={(v) => { setForm({ ...form, name: v }); setFieldErrors(e => ({ ...e, name: null })); }}
              placeholder="e.g. Car Loan"
              placeholderTextColor={colors.placeholder}
            />
            {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {LIABILITY_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, form.type === t && styles.typeChipActive]}
                  onPress={() => setForm({ ...form, type: t })}
                >
                  <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextActive]}>
                    {t === 'short-term' ? 'Short Term' : 'Long Term'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Amount (GBP) *</Text>
            <TextInput
              style={[styles.input, fieldErrors.amount && styles.inputError]}
              value={form.amount}
              onChangeText={(v) => { setForm({ ...form, amount: v }); setFieldErrors(e => ({ ...e, amount: null })); }}
              placeholder="0.00"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
            />
            {fieldErrors.amount ? <Text style={styles.fieldError}>{fieldErrors.amount}</Text> : null}

            <Text style={styles.label}>Interest Rate (%)</Text>
            <TextInput
              style={styles.input}
              value={form.interest_rate}
              onChangeText={(v) => setForm({ ...form, interest_rate: v })}
              placeholder="e.g. 5.5"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
            />

            <DatePickerField
              label="Due Date"
              value={form.due_date}
              onChange={(v) => setForm({ ...form, due_date: v })}
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
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingLiability ? 'Save Changes' : 'Add Liability'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  addBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: colors.textTertiary, marginTop: 60, fontSize: 15 },
  item: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 },
  itemType: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  itemMeta: { fontSize: 12, color: colors.textTertiary },
  itemAmount: { fontSize: 16, fontWeight: '700', color: colors.danger },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary,
  },
  editBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  deleteBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger,
  },
  deleteBtnText: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 16, color: colors.primary },
  label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: colors.text, marginBottom: 4,
  },
  inputError: { borderColor: '#ef4444' },
  fieldError: { fontSize: 12, color: '#ef4444', marginBottom: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 13, color: colors.textSecondary },
  typeChipTextActive: { color: '#fff' },
  pendingFile: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight,
    borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.primary,
  },
  pendingFileName: { flex: 1, fontSize: 14, color: colors.primary },
  removeFile: { fontSize: 18, color: colors.textSecondary, paddingLeft: 8 },
  attachBtn: {
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  attachBtnText: { fontSize: 14, color: colors.textSecondary },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  searchRow: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchInput: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text },
  sortRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  sortChipActive: { backgroundColor: colors.dangerLight, borderColor: colors.danger },
  sortChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  sortChipTextActive: { color: colors.danger, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: { backgroundColor: colors.danger, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
