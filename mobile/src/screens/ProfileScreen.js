import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  getProfile, getServiceHealth,
  getNominees, addNominee, removeNominee,
  getDelegatedAccounts,
} from '../api/client';

const StatusDot = ({ status }) => (
  <View style={[styles.dot, status === 'up' ? styles.dotUp : styles.dotDown]} />
);

const INACTIVITY_OPTIONS = [7, 14, 30, 60, 90];

export default function ProfileScreen() {
  const { user, logout, isDelegated, delegateAccount } = useAuth();

  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [nominees, setNominees] = useState([]);
  const [delegatedAccounts, setDelegatedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add nominee modal
  const [modalVisible, setModalVisible] = useState(false);
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [inactivityDays, setInactivityDays] = useState(30);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const results = await Promise.allSettled([
        getProfile(),
        getServiceHealth(),
        getNominees(),
        getDelegatedAccounts(),
      ]);
      if (results[0].status === 'fulfilled') {
        setProfile(results[0].value.data.profile || results[0].value.data.user || results[0].value.data);
      }
      if (results[1].status === 'fulfilled') setServices(results[1].value.data.services || []);
      if (results[2].status === 'fulfilled') setNominees(results[2].value.data.nominees || []);
      if (results[3].status === 'fulfilled') setDelegatedAccounts(results[3].value.data.accounts || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleAddNominee = async () => {
    if (!nomineeEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    setSaving(true);
    try {
      await addNominee(nomineeEmail.trim().toLowerCase(), inactivityDays);
      setModalVisible(false);
      setNomineeEmail('');
      setInactivityDays(30);
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not add nominee');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveNominee = (id, email) => {
    Alert.alert('Remove Nominee', `Remove ${email} as a trusted contact?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeNominee(id);
            load();
          } catch {
            Alert.alert('Error', 'Could not remove nominee');
          }
        },
      },
    ]);
  };

  const handleViewAccount = async (account) => {
    Alert.alert(
      'Access Account',
      `You are about to view ${account.owner_email}'s account. You will have full access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'View Account',
          onPress: async () => {
            try {
              await delegateAccount(account.owner_id, account.owner_email);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not access account');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const displayUser = profile || user;
  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : displayUser?.name || displayUser?.email || 'User';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Avatar card */}
      <View style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{displayUser?.email || ''}</Text>
      </View>

      {/* Trusted Contacts — hidden when in delegated mode */}
      {!isDelegated && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trusted Contacts</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSub}>
            These people can access your account if you're inactive for the set number of days.
          </Text>

          {nominees.length === 0 ? (
            <Text style={styles.emptyText}>No trusted contacts yet.</Text>
          ) : (
            nominees.map((n) => (
              <View key={n.id} style={styles.nomineeRow}>
                <View style={styles.nomineeLeft}>
                  <Text style={styles.nomineeEmail}>{n.nominee_email}</Text>
                  <Text style={styles.nomineeMeta}>
                    Access after {n.inactivity_days} days inactive
                  </Text>
                </View>
                <View style={styles.nomineeRight}>
                  <View style={[styles.statusBadge, n.status === 'accepted' ? styles.badgeActive : styles.badgePending]}>
                    <Text style={[styles.badgeText, n.status === 'accepted' ? styles.badgeTextActive : styles.badgeTextPending]}>
                      {n.status === 'accepted' ? 'Active' : 'Pending'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveNominee(n.id, n.nominee_email)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Accounts I can access — hidden when in delegated mode */}
      {!isDelegated && delegatedAccounts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Accounts I Can Access</Text>
          <Text style={styles.sectionSub}>
            Accounts where you are a trusted contact.
          </Text>

          {delegatedAccounts.map((acc) => (
            <View key={acc.owner_id} style={styles.delegatedRow}>
              <View style={styles.delegatedLeft}>
                <Text style={styles.delegatedEmail}>{acc.owner_email}</Text>
                {acc.access_available ? (
                  <Text style={styles.accessAvailable}>● Access available</Text>
                ) : (
                  <Text style={styles.accessPending}>
                    ● {acc.days_remaining} day{acc.days_remaining !== 1 ? 's' : ''} remaining
                  </Text>
                )}
              </View>
              {acc.access_available && (
                <TouchableOpacity style={styles.viewBtn} onPress={() => handleViewAccount(acc)}>
                  <Text style={styles.viewBtnText}>View</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Service Health */}
      {services.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Health</Text>
          {services.map((svc) => (
            <View key={svc.name} style={styles.serviceRow}>
              <View style={styles.serviceLeft}>
                <StatusDot status={svc.status} />
                <Text style={styles.serviceName}>{svc.name}</Text>
              </View>
              <Text style={[styles.serviceStatus, svc.status === 'up' ? styles.statusUp : styles.statusDown]}>
                {svc.status}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Add Nominee Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Trusted Contact</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setNomineeEmail(''); setInactivityDays(30); }}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              This person will be able to access your account with their own login if you haven't logged in for the number of days you choose below.
            </Text>

            <Text style={styles.label}>Their Email Address *</Text>
            <TextInput
              style={styles.input}
              value={nomineeEmail}
              onChangeText={setNomineeEmail}
              placeholder="their@email.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Grant access after how many days of inactivity?</Text>
            <View style={styles.chipRow}>
              {INACTIVITY_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, inactivityDays === d && styles.chipActive]}
                  onPress={() => setInactivityDays(d)}
                >
                  <Text style={[styles.chipText, inactivityDays === d && styles.chipTextActive]}>
                    {d} days
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddNominee} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Add Trusted Contact</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  avatarCard: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarText: { fontSize: 30, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  email: { fontSize: 14, color: '#6b7280' },

  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  sectionSub: { fontSize: 12, color: '#9ca3af', marginBottom: 14, lineHeight: 18 },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },

  addBtn: { backgroundColor: '#2563eb', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  nomineeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  nomineeLeft: { flex: 1 },
  nomineeEmail: { fontSize: 14, color: '#111827', fontWeight: '500' },
  nomineeMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  nomineeRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeActive: { backgroundColor: '#dcfce7' },
  badgePending: { backgroundColor: '#fef9c3' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: '#16a34a' },
  badgeTextPending: { color: '#92400e' },
  removeText: { fontSize: 12, color: '#ef4444' },

  delegatedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  delegatedLeft: { flex: 1 },
  delegatedEmail: { fontSize: 14, color: '#111827', fontWeight: '500' },
  accessAvailable: { fontSize: 12, color: '#16a34a', marginTop: 2 },
  accessPending: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  viewBtn: { backgroundColor: '#2563eb', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 12 },
  viewBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  serviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUp: { backgroundColor: '#16a34a' },
  dotDown: { backgroundColor: '#ef4444' },
  serviceName: { fontSize: 14, color: '#374151' },
  serviceStatus: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase' },
  statusUp: { color: '#16a34a' },
  statusDown: { color: '#ef4444' },

  logoutBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },

  modal: { flex: 1, backgroundColor: '#f9fafb' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 16, color: '#2563eb' },
  modalDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
