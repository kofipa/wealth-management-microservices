import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, register as apiRegister, requestDelegation, setActiveToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

// Wrappers so the rest of the file reads the same as before
const secureGet = (key) => SecureStore.getItemAsync(key);
const secureSet = (key, val) => SecureStore.setItemAsync(key, val);
const secureDel = (key) => SecureStore.deleteItemAsync(key);

// One-time migration: move tokens from AsyncStorage → SecureStore, then wipe AsyncStorage copies.
// Runs silently on first launch after the upgrade; no-ops on subsequent launches.
const MIGRATE_KEYS = ['token', 'user', 'delegatedToken', 'delegatedFor'];
async function migrateFromAsyncStorage() {
  try {
    for (const key of MIGRATE_KEYS) {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) {
        await SecureStore.setItemAsync(key, val);
        await AsyncStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('Auth migration warning:', e);
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDelegated, setIsDelegated] = useState(false);
  const [delegatedFor, setDelegatedFor] = useState(null);

  // Register auto-logout: called by client.js when any API returns 401/403
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await secureDel('token');
      await secureDel('user');
      await secureDel('delegatedToken');
      await secureDel('delegatedFor');
      setActiveToken(null);
      setToken(null);
      setUser(null);
      setIsDelegated(false);
      setDelegatedFor(null);
    });
  }, []);

  useEffect(() => {
    const restore = async () => {
      try {
        // Migrate any tokens that were stored in AsyncStorage before the SecureStore upgrade
        await migrateFromAsyncStorage();

        const token = await secureGet('token');
        const user = await secureGet('user');
        const delegatedToken = await secureGet('delegatedToken');
        const delegatedFor = await secureGet('delegatedFor');
        if (token) {
          setToken(token);
          setActiveToken(token);
        }
        if (user) setUser(JSON.parse(user));
        if (delegatedToken && delegatedFor) {
          setIsDelegated(true);
          setDelegatedFor(JSON.parse(delegatedFor));
          setActiveToken(delegatedToken);
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin(email, password);
    const { token: t, userId, email: e } = res.data;
    const u = { id: userId, email: e };
    await secureSet('token', t);
    await secureSet('user', JSON.stringify(u));
    setActiveToken(t);
    setToken(t);
    setUser(u);
  };

  const register = async (name, email, password) => {
    await apiRegister(name, email, password);
    await login(email, password);
  };

  const logout = async () => {
    await secureDel('token');
    await secureDel('user');
    await secureDel('delegatedToken');
    await secureDel('delegatedFor');
    setActiveToken(null);
    setToken(null);
    setUser(null);
    setIsDelegated(false);
    setDelegatedFor(null);
  };

  const delegateAccount = async (ownerId, ownerEmail) => {
    const res = await requestDelegation(ownerId);
    await secureSet('delegatedToken', res.data.token);
    await secureSet('delegatedFor', JSON.stringify({ email: ownerEmail }));
    setActiveToken(res.data.token);
    setIsDelegated(true);
    setDelegatedFor({ email: ownerEmail });
  };

  const exitDelegation = async () => {
    const token = await secureGet('token');
    await secureDel('delegatedToken');
    await secureDel('delegatedFor');
    setActiveToken(token);
    setIsDelegated(false);
    setDelegatedFor(null);
  };

  return (
    <AuthContext.Provider value={{
      token, user, loading,
      isDelegated, delegatedFor,
      login, register, logout,
      delegateAccount, exitDelegation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
