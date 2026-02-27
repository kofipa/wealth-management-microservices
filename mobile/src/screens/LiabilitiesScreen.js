import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLiabilities, createLiability, deleteLiability } from '../api/client';

const fmt = (n) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n ?? 0);

const LIABILITY_TYPES = ['short-term', 'long-term'];

export default function LiabilitiesScreen() {
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'short-term', amount: '', interest_rate: '', description: '' });

  const load = async () => {
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

  const handleAdd = async () => {
    if (!form.name || !form.amount) {
      Alert.alert('Error', 'Name and amount are required');
      return;
    }
    setSaving(true);
    try {
      await createLiability({
        name: form.name,
        type: form.type,
        amount: parseFloat(form.amount),
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : undefined,
        description: form.description,
      });
      setModalVisible(false);
      setForm({ name: '', type: 'short-term', amount: '', interest_rate: '', description: '' });
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not create liability');
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
            <View style={styles.itemLeft}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemType}>{item.type}</Text>
              {item.interest_rate ? <Text style={styles.itemDesc}>{item.interest_rate}% interest</Text> : null}
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
              <TouchableOpacity onPress={() => handleDelete(item.id, item.name)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Liability</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="e.g. Car Loan" placeholderTextColor="#9ca3af" />

            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {LIABILITY_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, form.type === t && styles.typeChipActive]}
                  onPress={() => setForm({ ...form, type: t })}
                >
                  <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Amount (GBP) *</Text>
            <TextInput style={styles.input} value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v })} placeholder="0.00" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />

            <Text style={styles.label}>Interest Rate (%)</Text>
            <TextInput style={styles.input} value={form.interest_rate} onChangeText={(v) => setForm({ ...form, interest_rate: v })} placeholder="e.g. 5.5" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.textArea]} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Optional notes" placeholderTextColor="#9ca3af" multiline numberOfLines={3} />

            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Add Liability</Text>}
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
  itemLeft: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  itemType: { fontSize: 12, color: '#6b7280', textTransform: 'capitalize', marginBottom: 2 },
  itemDesc: { fontSize: 12, color: '#9ca3af' },
  itemRight: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 16, fontWeight: '700', color: '#ef4444', marginBottom: 6 },
  deleteText: { fontSize: 13, color: '#ef4444' },
  modal: { flex: 1, backgroundColor: '#f9fafb' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 16, color: '#2563eb' },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  typeChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeChipText: { fontSize: 13, color: '#374151' },
  typeChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
