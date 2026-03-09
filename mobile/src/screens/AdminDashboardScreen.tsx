// ─────────────────────────────────────────────────────────────────────────────
// Admin Dashboard Screen
//
// Accessible only to the admin wallet (ADMIN_WALLET in constants.ts).
// Allows creation and management of quests on Solana devnet.
// Navigate to this screen from Profile screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useWallet } from '../contexts/WalletContext';
import { useMWASign } from '../hooks/useMWASign';
import {
  isAdmin,
  createQuest,
  listQuests,
  OnChainQuest,
  QuestParams,
} from '../services/adminService';
import { Colors } from '../utils/colors';

type QuestType = 'cleanup' | 'planting' | 'photo' | 'survey';
type ActiveView = 'list' | 'create';

const QUEST_TYPES: { key: QuestType; label: string; icon: string }[] = [
  { key: 'cleanup', label: 'Cleanup', icon: '🗑️' },
  { key: 'planting', label: 'Planting', icon: '🌱' },
  { key: 'photo', label: 'Photo', icon: '📷' },
  { key: 'survey', label: 'Survey', icon: '📋' },
];

const AdminDashboardScreen = ({ navigation }: any) => {
  const { connected, publicKeyBase58, publicKey } = useWallet();
  const { signTransaction } = useMWASign();
  const [view, setView] = useState<ActiveView>('list');
  const [quests, setQuests] = useState<OnChainQuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('500');
  const [latitude, setLatitude] = useState('-7.7956');
  const [longitude, setLongitude] = useState('110.3695');
  const [radius, setRadius] = useState('500');
  const [questType, setQuestType] = useState<QuestType>('cleanup');
  const [duration, setDuration] = useState('24');

  // ── Access Guard ────────────────────────────────────────────────────────────

  const adminAccess = isAdmin(publicKeyBase58);

  useEffect(() => {
    if (!adminAccess) return;
    loadQuests();
  }, [adminAccess]);

  // ── Data ────────────────────────────────────────────────────────────────────

  const loadQuests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listQuests();
      setQuests(data);
    } catch (err) {
      Alert.alert('Error', 'Failed to load quests from chain');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateQuest = useCallback(async () => {
    if (!publicKey) {
      Alert.alert('Error', 'Wallet not connected');
      return;
    }
    if (!title || !description) {
      Alert.alert('Validation', 'Title and description are required');
      return;
    }

    const params: QuestParams = {
      title,
      description,
      rewardAmount: Number(reward) || 500,
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusMeters: Number(radius) || 500,
      questType,
      durationHours: Number(duration) || 24,
    };

    setSubmitting(true);
    try {
      const sig = await createQuest(params, publicKey, signTransaction);
      Alert.alert(
        '✅ Quest Created',
        `Quest submitted to devnet!\nTX: ${sig.slice(0, 16)}...`,
        [{ text: 'OK', onPress: () => { setView('list'); loadQuests(); } }]
      );
      // Reset form
      setTitle(''); setDescription(''); setReward('500');
    } catch (err: any) {
      Alert.alert('Failed', err?.message ?? 'Transaction error');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, reward, latitude, longitude, radius, questType, duration, publicKey, loadQuests]);

  // ── Not Admin ───────────────────────────────────────────────────────────────

  if (!connected) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockText}>Connect wallet to access Admin</Text>
      </View>
    );
  }

  if (!adminAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🛡️ Admin Dashboard</Text>
        </View>
        <View style={styles.accessDenied}>
          <Text style={styles.lockIcon}>🚫</Text>
          <Text style={styles.lockText}>Access Denied</Text>
          <Text style={styles.lockSubtext}>
            Your wallet is not authorized as admin.{'\n'}
            Connected: {publicKeyBase58?.slice(0, 12)}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Quest List ──────────────────────────────────────────────────────────────

  const renderQuestItem = ({ item }: { item: OnChainQuest }) => (
    <View style={styles.questCard}>
      <View style={styles.questCardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.questTitle}>{item.title}</Text>
          <Text style={styles.questMeta}>
            {item.questType.toUpperCase()} · {item.rewardAmount} SKR · {item.completions} completions
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.active ? 'rgba(0,255,0,0.15)' : 'rgba(150,150,150,0.1)' }]}>
          <Text style={[styles.statusText, { color: item.active ? '#00ff00' : '#888' }]}>
            {item.active ? 'ACTIVE' : 'PAUSED'}
          </Text>
        </View>
      </View>
      <Text style={styles.questDesc} numberOfLines={1}>{item.description}</Text>
      <Text style={styles.questCoords}>
        📍 {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} · r={item.radiusMeters}m
      </Text>
    </View>
  );

  // ── Create Form ─────────────────────────────────────────────────────────────

  const renderCreateForm = () => (
    <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Quest Details</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Progo River Cleanup"
        placeholderTextColor="#555"
        maxLength={60}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the eco-activity..."
        placeholderTextColor="#555"
        multiline
        numberOfLines={3}
        maxLength={200}
      />

      <Text style={styles.sectionTitle}>Quest Type</Text>
      <View style={styles.typeRow}>
        {QUEST_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeChip, questType === t.key && styles.typeChipActive]}
            onPress={() => setQuestType(t.key)}
          >
            <Text style={styles.typeIcon}>{t.icon}</Text>
            <Text style={[styles.typeLabel, questType === t.key && styles.typeLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Location & Reward</Text>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Latitude</Text>
          <TextInput style={styles.input} value={latitude} onChangeText={setLatitude}
            keyboardType="numeric" placeholderTextColor="#555" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Longitude</Text>
          <TextInput style={styles.input} value={longitude} onChangeText={setLongitude}
            keyboardType="numeric" placeholderTextColor="#555" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Radius (m)</Text>
          <TextInput style={styles.input} value={radius} onChangeText={setRadius}
            keyboardType="numeric" placeholderTextColor="#555" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Reward (SKR)</Text>
          <TextInput style={styles.input} value={reward} onChangeText={setReward}
            keyboardType="numeric" placeholderTextColor="#555" />
        </View>
      </View>

      <Text style={styles.label}>Duration (hours)</Text>
      <TextInput style={styles.input} value={duration} onChangeText={setDuration}
        keyboardType="numeric" placeholderTextColor="#555" />

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={handleCreateQuest}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#000" />
          : <Text style={styles.submitBtnText}>🌿 Create Quest on Devnet</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Main Render ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: Colors.background.dark }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🛡️ Admin Dashboard</Text>
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>ADMIN</Text>
          </View>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{quests.length}</Text>
            <Text style={styles.statLabel}>Total Quests</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{quests.filter(q => q.active).length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{quests.reduce((s, q) => s + q.completions, 0)}</Text>
            <Text style={styles.statLabel}>Completions</Text>
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabContainer}>
          {(['list', 'create'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, view === tab && styles.tabActive]}
              onPress={() => setView(tab)}
            >
              <Text style={[styles.tabText, view === tab && styles.tabTextActive]}>
                {tab === 'list' ? '📋 All Quests' : '➕ Create Quest'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {view === 'list' ? (
          loading
            ? <ActivityIndicator color="#00ff00" style={{ marginTop: 40 }} />
            : (
              <FlatList
                data={quests}
                renderItem={renderQuestItem}
                keyExtractor={(q) => q.id}
                contentContainerStyle={{ padding: 20 }}
                refreshing={loading}
                onRefresh={loadQuests}
              />
            )
        ) : renderCreateForm()}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 10 },
  backBtn: { padding: 4 },
  backBtnText: { color: '#00ff00', fontSize: 14 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
  adminBadge: { backgroundColor: 'rgba(255,170,0,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  adminBadgeText: { color: '#ffaa00', fontSize: 10, fontWeight: '700' },

  statsBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(0,255,0,0.1)' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#00ff00' },
  statLabel: { fontSize: 10, color: '#666', marginTop: 2 },

  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(0,255,0,0.15)' },
  tabText: { color: '#666', fontWeight: '600', fontSize: 12 },
  tabTextActive: { color: '#00ff00' },

  questCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,255,0,0.15)' },
  questCardRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  questTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  questMeta: { color: '#aaa', fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginLeft: 10 },
  statusText: { fontSize: 10, fontWeight: '700' },
  questDesc: { color: '#888', fontSize: 12, marginBottom: 4 },
  questCoords: { color: '#555', fontSize: 11 },

  form: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: { color: '#00ff00', fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  label: { color: '#aaa', fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  textarea: { height: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: { flex: 1, minWidth: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  typeChipActive: { backgroundColor: 'rgba(0,255,0,0.15)', borderColor: '#00ff00' },
  typeIcon: { fontSize: 22, marginBottom: 4 },
  typeLabel: { color: '#888', fontSize: 11, fontWeight: '500' },
  typeLabelActive: { color: '#00ff00' },
  submitBtn: { backgroundColor: '#00ff00', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#000', fontSize: 15, fontWeight: '800' },

  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  lockIcon: { fontSize: 60, marginBottom: 16 },
  lockText: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  lockSubtext: { color: '#666', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

export default AdminDashboardScreen;
