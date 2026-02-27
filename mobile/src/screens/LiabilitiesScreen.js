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

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const fmtType = (t) =>
  t ? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';

const LIABILITY_TYPES = ['short-term', 'long-term'];

const EMPTY_FORM = {
  name: '', type: 'short-term', amount: '', interest_rate: '', due_date: '', description: '',
};

export default function LiabilitiesScreen() {
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLiability, setEditingLiability] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
  };

  const openEditModal = (item) => {
    // liability_type from DB is short_term/long_term; form uses short-term/long-term
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
    if (!form.name || !form.amount) {
      Alert.alert('Error', 'Name and amount are required');
      return;
    }
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

  // File picker functions
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
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

      <FlatList
        data={liabilities}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No liabilities yet. Tap + Add to get started.</Text>}
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
              style={styles.input}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Car Loan"
              placeholderTextColor="#9ca3af"
            />

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
              style={styles.input}
              value={form.amount}
              onChangeText={(v) => setForm({ ...form, amount: v })}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Interest Rate (%)</Text>
            <TextInput
              style={styles.input}
              value={form.interest_rate}
              onChangeText={(v) => setForm({ ...form, interest_rate: v })}
              placeholder="e.g. 5.5"
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  totalLabel: { fontSize: 13, color: '#6b7280' },
  totalValue: { fontSize: 22, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 15 },
  item: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  itemType: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  itemMeta: { fontSize: 12, color: '#9ca3af' },
  itemAmount: { fontSize: 16, fontWeight: '700', color: '#ef4444' },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe',
  },
  editBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '500' },
  deleteBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3',
  },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
  modal: { flex: 1, backgroundColor: '#f9fafb' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 16, color: '#2563eb' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111827', marginBottom: 16,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  typeChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeChipText: { fontSize: 13, color: '#374151' },
  typeChipTextActive: { color: '#fff' },
  pendingFile: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff',
    borderRadius: 8, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe',
  },
  pendingFileName: { flex: 1, fontSize: 14, color: '#1d4ed8' },
  removeFile: { fontSize: 18, color: '#6b7280', paddingLeft: 8 },
  attachBtn: {
    borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  attachBtnText: { fontSize: 14, color: '#6b7280' },
  saveBtn: {
    backgroundColor: '#2563eb', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
