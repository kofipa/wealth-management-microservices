import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, register as apiRegister, requestDelegation, setActiveToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDelegated, setIsDelegated] = useState(false);
  const [delegatedFor, setDelegatedFor] = useState(null); // { email }

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const user = await AsyncStorage.getItem('user');
        const delegatedToken = await AsyncStorage.getItem('delegatedToken');
        const delegatedFor = await AsyncStorage.getItem('delegatedFor');
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
    // login returns { token, userId, email }
    const { token: t, userId, email: e } = res.data;
    const u = { id: userId, email: e };
    await AsyncStorage.setItem('token', t);
    await AsyncStorage.setItem('user', JSON.stringify(u));
    setActiveToken(t);
    setToken(t);
    setUser(u);
  };

  const register = async (name, email, password) => {
    // register endpoint doesn't return a token, so login immediately after
    await apiRegister(name, email, password);
    await login(email, password);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('delegatedToken');
    await AsyncStorage.removeItem('delegatedFor');
    setActiveToken(null);
    setToken(null);
    setUser(null);
    setIsDelegated(false);
    setDelegatedFor(null);
  };

  const delegateAccount = async (ownerId, ownerEmail) => {
    const res = await requestDelegation(ownerId);
    await AsyncStorage.setItem('delegatedToken', res.data.token);
    await AsyncStorage.setItem('delegatedFor', JSON.stringify({ email: ownerEmail }));
    setActiveToken(res.data.token);
    setIsDelegated(true);
    setDelegatedFor({ email: ownerEmail });
  };

  const exitDelegation = async () => {
    const token = await AsyncStorage.getItem('token');
    await AsyncStorage.removeItem('delegatedToken');
    await AsyncStorage.removeItem('delegatedFor');
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
