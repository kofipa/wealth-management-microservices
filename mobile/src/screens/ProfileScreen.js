import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppLogo from '../components/AppLogo';
import { validatePassword } from '../utils/validatePassword';
import {
  getProfile, getServiceHealth,
  getNominees, addNominee, updateNominee, removeNominee,
  getDelegatedAccounts, updateProfile, changePassword, changeEmail, deleteAccount,
  setSecurityQuestion,
} from '../api/client';

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was the name of the street you grew up on?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What was the make and model of your first car?",
  "What city were you born in?",
  "What is the name of your oldest sibling?",
  "What was the name of your childhood best friend?",
];

// Semantic status colours — kept fixed regardless of theme
const StatusDot = ({ status }) => (
  <View style={{
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: status === 'up' ? '#16a34a' : '#ef4444',
  }} />
);

const INACTIVITY_OPTIONS = [0, 7, 14, 30, 60, 90];

export default function ProfileScreen() {
  const { user, logout, isDelegated, delegateAccount } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const navigation = useNavigation();

  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [nominees, setNominees] = useState([]);
  const [delegatedAccounts, setDelegatedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [inactivityDays, setInactivityDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);

  const [editNomineeVisible, setEditNomineeVisible] = useState(false);
  const [editingNominee, setEditingNominee] = useState(null);
  const [editNomineeEmail, setEditNomineeEmail] = useState('');
  const [editInactivityDays, setEditInactivityDays] = useState(30);
  const [savingEdit, setSavingEdit] = useState(false);

  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', phone: '', date_of_birth: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);

  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [savingEmail, setSavingEmail] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const [sqModalVisible, setSqModalVisible] = useState(false);
  const [sqForm, setSqForm] = useState({ question: '', answer: '' });
  const [savingSq, setSavingSq] = useState(false);
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);

  const load = async () => {
    try {
      const results = await Promise.allSettled([
        getProfile(),
        getServiceHealth(),
        getNominees(),
        getDelegatedAccounts(),
      ]);
      if (results[0].status === 'fulfilled') {
        const p = results[0].value.data.profile || results[0].value.data.user || results[0].value.data;
        setProfile(p);
        if (p) setEditForm({
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          phone: p.phone || '',
          date_of_birth: p.date_of_birth ? p.date_of_birth.split('T')[0] : '',
        });
      }
      if (results[1].status === 'fulfilled') setServices(results[1].value.data.services || []);
      if (results[2].status === 'fulfilled') setNominees(results[2].value.data.nominees || []);
      if (results[3].status === 'fulfilled') setDelegatedAccounts(results[3].value.data.accounts || []);

      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHw && enrolled);
      if (hasHw && enrolled) {
        const stored = await SecureStore.getItemAsync('biometricEnabled');
        setBiometricEnabled(stored === '1');
      }
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

  const handleEditNomineeOpen = (n) => {
    setEditingNominee(n);
    setEditNomineeEmail(n.nominee_email);
    setEditInactivityDays(n.inactivity_days);
    setEditNomineeVisible(true);
  };

  const handleUpdateNominee = async () => {
    if (!editNomineeEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }
    setSavingEdit(true);
    try {
      await updateNominee(editingNominee.id, editNomineeEmail.trim().toLowerCase(), editInactivityDays);
      setEditNomineeVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update nominee');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleViewAccount = async (account) => {
    Alert.alert(
      'Access Account',
      `You are about to view ${account.owner_name || account.owner_email}'s account. You will have full access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'View Account',
          onPress: async () => {
            try {
              await delegateAccount(account.owner_id, account.owner_name);
              navigation.navigate('MainTabs', { screen: 'Dashboard' });
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not access account');
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile(editForm);
      setEditProfileVisible(false);
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwForm.next !== pwForm.confirm) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    const pwErr = validatePassword(pwForm.next);
    if (pwErr) { Alert.alert('Error', pwErr); return; }
    setSavingPw(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setPwModalVisible(false);
      setPwForm({ current: '', next: '', confirm: '' });
      Alert.alert('Success', 'Password updated successfully');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not change password');
    } finally {
      setSavingPw(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailForm.newEmail || !emailForm.password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setSavingEmail(true);
    try {
      const res = await changeEmail(emailForm.newEmail.trim(), emailForm.password);
      setEmailModalVisible(false);
      setEmailForm({ newEmail: '', password: '' });
      Alert.alert('Check your inbox', res.data.message);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not change email');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      Alert.alert('Error', 'Please enter your password to confirm');
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      setDeleteModalVisible(false);
      await logout();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const toggleBiometric = async (value) => {
    await SecureStore.setItemAsync('biometricEnabled', value ? '1' : '0');
    setBiometricEnabled(value);
  };

  const handleSaveSecurityQuestion = async () => {
    if (!sqForm.question) {
      Alert.alert('Error', 'Please select a security question');
      return;
    }
    if (sqForm.answer.trim().length < 2) {
      Alert.alert('Error', 'Please enter an answer');
      return;
    }
    setSavingSq(true);
    try {
      await setSecurityQuestion(sqForm.question, sqForm.answer);
      setSqModalVisible(false);
      setSqForm({ question: '', answer: '' });
      Alert.alert('Saved', 'Security question saved successfully');
      load();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not save security question');
    } finally {
      setSavingSq(false);
    }
  };

  const styles = makeStyles(colors);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
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
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <AppLogo size="small" />
        <TouchableOpacity style={styles.topBarSignOut} onPress={handleLogout}>
          <Text style={styles.topBarSignOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Avatar card */}
      <View style={styles.avatarCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{displayUser?.email || ''}</Text>
        {profile?.date_of_birth && (() => {
          const dob = new Date(profile.date_of_birth);
          const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));
          return (
            <Text style={styles.dobText}>
              {dob.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Age {age}
            </Text>
          );
        })()}
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => {
            if (profile) setEditForm({
              first_name: profile.first_name || '',
              last_name: profile.last_name || '',
              phone: profile.phone || '',
              date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
            });
            setEditProfileVisible(true);
          }}
        >
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Security section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <TouchableOpacity
          style={styles.securityRow}
          onPress={() => { setEmailForm({ newEmail: '', password: '' }); setEmailModalVisible(true); }}
        >
          <Text style={styles.securityRowLabel}>Change Email</Text>
          <Text style={styles.securityRowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.securityRow}
          onPress={() => { setPwForm({ current: '', next: '', confirm: '' }); setShowPw({ current: false, next: false, confirm: false }); setPwModalVisible(true); }}
        >
          <Text style={styles.securityRowLabel}>Change Password</Text>
          <Text style={styles.securityRowChevron}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.securityRow}
          onPress={() => {
            setSqForm({ question: profile?.security_question || '', answer: '' });
            setShowQuestionPicker(false);
            setSqModalVisible(true);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.securityRowLabel}>Security Question</Text>
            {profile?.security_question ? (
              <Text style={styles.securityRowSub} numberOfLines={1}>{profile.security_question}</Text>
            ) : (
              <Text style={styles.securityRowSubEmpty}>Not set — tap to add</Text>
            )}
          </View>
          <Text style={styles.securityRowChevron}>›</Text>
        </TouchableOpacity>
        {biometricAvailable && (
          <View style={styles.securityRow}>
            <Text style={styles.securityRowLabel}>Face / Touch ID Unlock</Text>
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometric}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={biometricEnabled ? colors.primary : colors.textTertiary}
            />
          </View>
        )}
        {/* Dark Mode Toggle */}
        <View style={styles.securityRow}>
          <Text style={styles.securityRowLabel}>Dark Mode</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={isDark ? colors.primary : colors.textTertiary}
          />
        </View>

        {/* Privacy & Security */}
        <TouchableOpacity style={styles.securityRow} onPress={() => navigation.navigate('PrivacySecurity')}>
          <Text style={styles.securityRowLabel}>Privacy & Security</Text>
          <Text style={styles.securityRowChevron}>›</Text>
        </TouchableOpacity>

        {/* Terms of Service */}
        <TouchableOpacity style={styles.securityRow} onPress={() => navigation.navigate('TermsOfService')}>
          <Text style={styles.securityRowLabel}>Terms of Service</Text>
          <Text style={styles.securityRowChevron}>›</Text>
        </TouchableOpacity>
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
                <View style={styles.nomineeTopRow}>
                  <Text style={styles.nomineeEmail}>{n.nominee_email}</Text>
                  <View style={[styles.statusBadge, n.status === 'accepted' ? styles.badgeActive : styles.badgePending]}>
                    <Text style={[styles.badgeText, n.status === 'accepted' ? styles.badgeTextActive : styles.badgeTextPending]}>
                      {n.status === 'accepted' ? 'Active' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.nomineeMeta}>
                  {n.inactivity_days === 0 ? 'Immediate access when activated' : `Access after ${n.inactivity_days} days inactive`}
                </Text>
                <View style={styles.nomineeActions}>
                  <TouchableOpacity style={styles.editNomineeBtn} onPress={() => handleEditNomineeOpen(n)}>
                    <Text style={styles.editNomineeText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveNominee(n.id, n.nominee_email)}>
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
                <Text style={styles.delegatedEmail}>{acc.owner_name || acc.owner_email}</Text>
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
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setHealthExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.serviceHealthTitle}>
              <Text style={styles.sectionTitle}>Service Health</Text>
              {services.some(s => s.status !== 'up') ? (
                <View style={styles.alertDot} />
              ) : (
                <View style={styles.allUpDot} />
              )}
            </View>
            <Text style={styles.chevron}>{healthExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {healthExpanded && services.map((svc) => (
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

      {/* Delete Account */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={() => { setDeletePassword(''); setDeleteModalVisible(true); }}
        >
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* App version */}
      <Text style={styles.versionText}>
        Version {Constants.expoConfig?.version || '1.0.0'}
      </Text>

      {/* Edit Profile Modal */}
      <Modal visible={editProfileVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={editForm.first_name}
              onChangeText={(v) => setEditForm({ ...editForm, first_name: v })}
              placeholder="First name"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={editForm.last_name}
              onChangeText={(v) => setEditForm({ ...editForm, last_name: v })}
              placeholder="Last name"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editForm.phone}
              onChangeText={(v) => setEditForm({ ...editForm, phone: v })}
              placeholder="e.g. +44 7700 900000"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={[styles.input, styles.datePickerBtn]}
              onPress={() => setShowDobPicker(true)}
            >
              <Text style={editForm.date_of_birth ? styles.datePickerText : styles.datePickerPlaceholder}>
                {editForm.date_of_birth
                  ? new Date(editForm.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Select date of birth'}
              </Text>
              <Text style={styles.datePickerIcon}>📅</Text>
            </TouchableOpacity>
            {showDobPicker && (
              <DateTimePicker
                value={editForm.date_of_birth ? new Date(editForm.date_of_birth) : new Date(1990, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === 'android') setShowDobPicker(false);
                  if (selectedDate) {
                    setEditForm({ ...editForm, date_of_birth: selectedDate.toISOString().split('T')[0] });
                  }
                }}
              />
            )}
            {showDobPicker && Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setShowDobPicker(false)}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleEditProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={pwModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Current Password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={styles.pwInput}
                value={pwForm.current}
                onChangeText={(v) => setPwForm({ ...pwForm, current: v })}
                placeholder="Your current password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPw.current}
              />
              <TouchableOpacity
                style={styles.pwEye}
                onPress={() => setShowPw((s) => ({ ...s, current: !s.current }))}
              >
                <Text style={styles.pwEyeText}>{showPw.current ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>New Password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={styles.pwInput}
                value={pwForm.next}
                onChangeText={(v) => setPwForm({ ...pwForm, next: v })}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPw.next}
              />
              <TouchableOpacity
                style={styles.pwEye}
                onPress={() => setShowPw((s) => ({ ...s, next: !s.next }))}
              >
                <Text style={styles.pwEyeText}>{showPw.next ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.pwWrap}>
              <TextInput
                style={styles.pwInput}
                value={pwForm.confirm}
                onChangeText={(v) => setPwForm({ ...pwForm, confirm: v })}
                placeholder="Repeat new password"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPw.confirm}
              />
              <TouchableOpacity
                style={styles.pwEye}
                onPress={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
              >
                <Text style={styles.pwEyeText}>{showPw.confirm ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={savingPw}>
              {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Email Modal */}
      <Modal visible={emailModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Email</Text>
              <TouchableOpacity onPress={() => setEmailModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>New Email Address</Text>
            <TextInput
              style={styles.input}
              value={emailForm.newEmail}
              onChangeText={(v) => setEmailForm({ ...emailForm, newEmail: v })}
              placeholder="Enter new email"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              value={emailForm.password}
              onChangeText={(v) => setEmailForm({ ...emailForm, password: v })}
              placeholder="Confirm your password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
            />

            <Text style={[styles.label, { color: colors.textSecondary, fontSize: 13, marginTop: -4 }]}>
              A verification link will be sent to your new address. Your email won't change until you click it.
            </Text>

            <TouchableOpacity style={styles.saveBtn} onPress={handleChangeEmail} disabled={savingEmail}>
              {savingEmail ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Send Verification Email</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Security Question Modal */}
      <Modal visible={sqModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Security Question</Text>
              <TouchableOpacity onPress={() => { setSqModalVisible(false); setShowQuestionPicker(false); }}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Your security question can be used to verify your identity if you forget your password.
            </Text>

            <Text style={styles.label}>Question</Text>
            <TouchableOpacity
              style={[styles.input, styles.datePickerBtn]}
              onPress={() => setShowQuestionPicker(v => !v)}
            >
              <Text style={sqForm.question ? styles.datePickerText : styles.datePickerPlaceholder} numberOfLines={2}>
                {sqForm.question || 'Select a question…'}
              </Text>
              <Text style={styles.datePickerIcon}>{showQuestionPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showQuestionPicker && (
              <View style={styles.questionList}>
                {SECURITY_QUESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.questionItem, sqForm.question === q && styles.questionItemActive]}
                    onPress={() => { setSqForm({ ...sqForm, question: q }); setShowQuestionPicker(false); }}
                  >
                    <Text style={[styles.questionItemText, sqForm.question === q && styles.questionItemTextActive]}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Your Answer</Text>
            <TextInput
              style={styles.input}
              value={sqForm.answer}
              onChangeText={(v) => setSqForm({ ...sqForm, answer: v })}
              placeholder="Enter your answer"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.sqHint}>Answers are case-insensitive. Enter the same answer when resetting your password.</Text>

            <TouchableOpacity style={[styles.saveBtn, { marginTop: 8 }]} onPress={handleSaveSecurityQuestion} disabled={savingSq}>
              {savingSq ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Security Question</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={deleteModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.danger }]}>Delete Account</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.danger, fontWeight: '600', marginBottom: 4 }]}>
              This action is permanent and cannot be undone.
            </Text>
            <Text style={[styles.label, { color: colors.textSecondary, fontSize: 13, marginBottom: 20 }]}>
              All your assets, liabilities, documents, and account data will be permanently deleted.
            </Text>

            <Text style={styles.label}>Enter your password to confirm</Text>
            <TextInput
              style={styles.input}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Your current password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.danger }]}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Permanently Delete My Account</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
              placeholderTextColor={colors.placeholder}
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
                    {d === 0 ? 'Now' : `${d} days`}
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

      {/* Edit Nominee Modal */}
      <Modal visible={editNomineeVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Trusted Contact</Text>
              <TouchableOpacity onPress={() => setEditNomineeVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={editNomineeEmail}
              onChangeText={setEditNomineeEmail}
              placeholder="nominee@example.com"
              placeholderTextColor={colors.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Grant access after how many days of inactivity?</Text>
            <View style={styles.chipRow}>
              {INACTIVITY_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, editInactivityDays === d && styles.chipActive]}
                  onPress={() => setEditInactivityDays(d)}
                >
                  <Text style={[styles.chipText, editInactivityDays === d && styles.chipTextActive]}>
                    {d === 0 ? 'Now' : `${d} days`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateNominee} disabled={savingEdit}>
              {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  avatarCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarText: { fontSize: 30, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 },
  email: { fontSize: 14, color: colors.textSecondary, marginBottom: 6 },
  dobText: { fontSize: 13, color: colors.textTertiary, marginBottom: 16 },
  editProfileBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  editProfileBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, marginTop: 4 },
  securityRowLabel: { fontSize: 15, color: colors.text },
  securityRowChevron: { fontSize: 22, color: colors.textTertiary },
  versionText: { textAlign: 'center', fontSize: 12, color: colors.border, marginTop: 8, marginBottom: 20 },
  deleteAccountBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  deleteAccountText: { color: colors.danger, fontSize: 15, fontWeight: '600' },

  section: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.textTertiary, marginBottom: 14, lineHeight: 18 },
  emptyText: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 },

  addBtn: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  nomineeRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  nomineeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nomineeActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  nomineeEmail: { fontSize: 14, color: colors.text, fontWeight: '500' },
  nomineeMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeActive: { backgroundColor: colors.successLight },
  badgePending: { backgroundColor: colors.warningLight },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: colors.success },
  badgeTextPending: { color: colors.warning },
  editNomineeBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary,
  },
  editNomineeText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  removeBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger,
  },
  removeText: { fontSize: 13, color: colors.danger, fontWeight: '500' },

  delegatedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  delegatedLeft: { flex: 1 },
  delegatedEmail: { fontSize: 14, color: colors.text, fontWeight: '500' },
  accessAvailable: { fontSize: 12, color: colors.success, marginTop: 2 },
  accessPending: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  viewBtn: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 12 },
  viewBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  serviceHealthTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allUpDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  chevron: { fontSize: 12, color: colors.textTertiary },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, marginTop: 4 },
  serviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  serviceName: { fontSize: 14, color: colors.textSecondary },
  serviceStatus: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase' },
  statusUp: { color: colors.success },
  statusDown: { color: colors.danger },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  topBarSpacer: { flex: 1 },
  topBarSignOut: { flex: 1, alignItems: 'flex-end' },
  topBarSignOutText: { fontSize: 14, fontWeight: '600', color: colors.danger },

  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  modalClose: { fontSize: 16, color: colors.primary },
  modalDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 20 },
  pwWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 20 },
  pwInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  pwEye: { paddingHorizontal: 14, paddingVertical: 12 },
  pwEyeText: { fontSize: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePickerText: { fontSize: 16, color: colors.text },
  datePickerPlaceholder: { fontSize: 16, color: colors.placeholder },
  datePickerIcon: { fontSize: 18 },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 12 },
  doneBtnText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  securityRowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  securityRowSubEmpty: { fontSize: 12, color: colors.warning, marginTop: 2 },
  questionList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 20, overflow: 'hidden' },
  questionItem: { paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt, backgroundColor: colors.surface },
  questionItemActive: { backgroundColor: colors.primaryLight },
  questionItemText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  questionItemTextActive: { color: colors.primary, fontWeight: '600' },
  sqHint: { fontSize: 12, color: colors.textTertiary, lineHeight: 18, marginBottom: 20 },
});
