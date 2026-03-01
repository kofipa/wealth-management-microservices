import React, { useRef, useState, useEffect } from 'react';
import {
  View, ActivityIndicator, TouchableOpacity, Text,
  AppState, Modal, StyleSheet,
} from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AssetsScreen from '../screens/AssetsScreen';
import LiabilitiesScreen from '../screens/LiabilitiesScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import ServicesScreen from '../screens/ServicesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

const AppStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

function ProfileButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Profile')}
      style={{ marginRight: 16 }}
    >
      <Text style={{ fontSize: 24 }}>👤</Text>
    </TouchableOpacity>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerRight: () => <ProfileButton />,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopColor: '#e5e7eb' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Assets"
        component={AssetsScreen}
        options={{
          title: 'Assets',
          tabBarIcon: ({ focused }) => <TabIcon icon="💰" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Liabilities"
        component={LiabilitiesScreen}
        options={{
          title: 'Liabilities',
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{
          title: 'Documents',
          tabBarIcon: ({ focused }) => <TabIcon icon="📄" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          title: 'Services',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏦" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function DelegationBanner() {
  const { isDelegated, delegatedFor, exitDelegation } = useAuth();
  if (!isDelegated) return null;
  return (
    <View style={{
      backgroundColor: '#f97316',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    }}>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, flex: 1 }}>
        Viewing {delegatedFor?.email}'s account
      </Text>
      <TouchableOpacity onPress={exitDelegation}>
        <Text style={{ color: '#fff', fontSize: 13, textDecorationLine: 'underline' }}>
          Return to mine
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AppNavigatorStack({ navigationRef }) {
  const [biometricLocked, setBiometricLocked] = useState(false);
  const bgTimestamp = useRef(null);

  useEffect(() => {
    const handleAppStateChange = async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        bgTimestamp.current = Date.now();
      } else if (nextState === 'active' && bgTimestamp.current) {
        const elapsed = Date.now() - bgTimestamp.current;
        bgTimestamp.current = null;
        if (elapsed > 5 * 60 * 1000) {
          const biometricEnabled = await SecureStore.getItemAsync('biometricEnabled');
          if (biometricEnabled === '1') {
            const hasHw = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();
            if (hasHw && enrolled) {
              setBiometricLocked(true);
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Wealth Manager',
                cancelLabel: 'Use Passcode',
              });
              if (result.success) {
                setBiometricLocked(false);
              }
            }
          }
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <DelegationBanner />
      <AppStack.Navigator>
        <AppStack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <AppStack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <AppStack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: 'Profile',
            headerStyle: { backgroundColor: '#fff' },
            headerTitleStyle: { fontWeight: '700', fontSize: 18 },
            headerBackTitle: 'Back',
          }}
        />
      </AppStack.Navigator>

      {/* Biometric lock overlay */}
      <Modal visible={biometricLocked} transparent animationType="fade">
        <View style={styles.lockOverlay}>
          <Text style={styles.lockEmoji}>🔒</Text>
          <Text style={styles.lockTitle}>Wealth Manager Locked</Text>
          <Text style={styles.lockSub}>Authenticate to continue</Text>
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={async () => {
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Wealth Manager',
                cancelLabel: 'Cancel',
              });
              if (result.success) setBiometricLocked(false);
            }}
          >
            <Text style={styles.lockBtnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function AuthNavigatorStack() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export default function AppNavigator() {
  const { token, loading } = useAuth();
  const navigationRef = useRef(null);

  const handleNavigationReady = async () => {
    const done = await SecureStore.getItemAsync('onboardingDone');
    if (!done && navigationRef.current) {
      navigationRef.current.navigate('Onboarding');
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={token ? handleNavigationReady : undefined}>
      {token ? <AppNavigatorStack navigationRef={navigationRef} /> : <AuthNavigatorStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  lockEmoji: { fontSize: 64, marginBottom: 24 },
  lockTitle: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8 },
  lockSub: { fontSize: 16, color: '#9ca3af', marginBottom: 40 },
  lockBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  lockBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
