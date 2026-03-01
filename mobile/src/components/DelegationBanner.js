import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function DelegationBanner() {
  const { isDelegated, delegatedFor, exitDelegation } = useAuth();
  if (!isDelegated) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Viewing {delegatedFor?.email}'s account
      </Text>
      <TouchableOpacity onPress={exitDelegation}>
        <Text style={styles.link}>Return to mine</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#7c3aed',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  text: { color: '#4c1d95', fontWeight: '600', fontSize: 13, flex: 1 },
  link: { color: '#7c3aed', fontSize: 13, textDecorationLine: 'underline' },
});
