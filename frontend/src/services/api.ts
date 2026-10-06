import axios from 'axios';
import type { Card, ReviewCreate, ReviewResponse, CSVImportRequest, CSVImportResponse, QueueItem } from '../types';

const API_URL = '/api';

const TOKEN_KEY = 'aicards_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the long-lived token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Let the app show the login screen on 401
export const UNAUTHORIZED_EVENT = 'aicards:unauthorized';
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

// ============ CARDS API ============

export async function getCardsDue(language: string, tag?: string, limit: number = 20): Promise<QueueItem[]> {
  const params: Record<string, any> = { language, limit };
  if (tag) params.tag = tag;
  const res = await api.get('/cards/due', { params });
  return res.data;
}

export async function getCardsByTag(language: string, tag: string): Promise<Card[]> {
  const res = await api.get('/cards/by-tag', { params: { language, tag } });
  return res.data;
}

export async function getAllTags(language?: string): Promise<string[]> {
  const params: Record<string, any> = {};
  if (language) params.language = language;
  const res = await api.get('/cards/tags', { params });
  return res.data;
}

export async function searchCards(
  language: string,
  tag?: string,
  search?: string,
  limit: number = 200
): Promise<Card[]> {
  const params: Record<string, any> = { language, limit };
  if (tag) params.tag = tag;
  if (search) params.search = search;
  const res = await api.get('/cards/search', { params });
  return res.data;
}

export async function getCard(cardId: number): Promise<Card> {
  const res = await api.get(`/cards/${cardId}`);
  return res.data;
}

export async function createCard(card: {
  front: string;
  back: string;
  hint?: string;
  tags?: string[];
  language?: string;
}): Promise<Card> {
  const res = await api.post('/cards/', card);
  return res.data;
}

export async function updateCard(
  cardId: number,
  data: { back?: string; hint?: string; tags?: string[] }
): Promise<Card> {
  const res = await api.patch(`/cards/${cardId}`, data);
  return res.data;
}

export async function deleteCard(cardId: number): Promise<void> {
  await api.delete(`/cards/${cardId}`);
}

export async function importCards(data: CSVImportRequest): Promise<CSVImportResponse> {
  const res = await api.post('/cards/import', data);
  return res.data;
}

export async function translateWord(
  word: string,
  sourceLang: string,
  targetLang: string
): Promise<{ translated: string | null; source_lang: string; target_lang: string }> {
  try {
    const res = await api.post('/translate', { word, source_lang: sourceLang, target_lang: targetLang });
    return res.data;
  } catch {
    return { translated: null, source_lang: sourceLang, target_lang: targetLang };
  }
}

// ============ REVIEWS API ============

export async function logReview(review: ReviewCreate): Promise<ReviewResponse> {
  const res = await api.post('/reviews/', review);
  return res.data;
}

export async function logReverseReview(review: ReviewCreate): Promise<ReviewResponse> {
  const res = await api.post('/reviews/reverse', review);
  return res.data;
}

export async function getCardReviewHistory(cardId: number, limit: number = 10) {
  const res = await api.get(`/reviews/${cardId}/history`, { params: { limit } });
  return res.data;
}

// ============ GROQ SENTENCE + EXAMPLES API ============

export async function generateSentence(language: string): Promise<{sentence_in_target: string, translation_in_russian: string}> {
  const res = await api.post('/groq/sentence', { language });
  return res.data;
}

export interface ExampleItem {
  sentence_in_target: string;
  translation_in_russian: string;
  form?: string;
}

export interface ExampleSynonym {
  word: string;
  note: string;
}

export interface ExamplesResponse {
  word: string;
  language: string;
  examples: ExampleItem[];
  usage_notes: string;
  synonyms: ExampleSynonym[];
}

export async function generateExamples(cardId: number): Promise<ExamplesResponse> {
  const res = await api.post('/groq/examples', { card_id: cardId });
  return res.data;
}

export interface NotesResponse {
  word: string;
  language: string;
  usage_notes: string;
  synonyms: ExampleSynonym[];
}

export async function generateNotes(cardId: number): Promise<NotesResponse> {
  const res = await api.post('/groq/notes', { card_id: cardId });
  return res.data;
}

// ============ OBSIDIAN API ============

export async function syncObsidian(): Promise<{ synced: number; updated: number; total: number }> {
  const res = await api.post('/obsidian/sync');
  return res.data;
}

export async function getObsidianNotes(tag?: string, limit: number = 50) {
  const params: Record<string, any> = { limit };
  if (tag) params.tag = tag;
  const res = await api.get('/obsidian/notes', { params });
  return res.data;
}

export async function getObsidianNote(noteId: number) {
  const res = await api.get(`/obsidian/notes/${noteId}`);
  return res.data;
}

export async function getDueNotes(limit: number = 5, tag?: string) {
  const params: Record<string, any> = { limit };
  if (tag) params.tag = tag;
  const res = await api.get('/obsidian/due', { params });
  return res.data;
}

export async function generateQuestions(
  noteId: number,
  numQuestions: number = 1,
  advanced: boolean = false
): Promise<{ questions: Array<{ question: string; answer: string }>; note_id: number }> {
  const res = await api.post('/obsidian/questions', null, {
    params: { note_id: noteId, num_questions: numQuestions, advanced },
  });
  return res.data;
}

export async function logObsidianReview(
  noteId: number,
  rating: number,
  timeSeconds: number = 0
) {
  const res = await api.post('/obsidian/reviews', null, {
    params: { note_id: noteId, rating, time_seconds: timeSeconds },
  });
  return res.data;
}

export async function deleteObsidianNote(noteId: number) {
  await api.delete(`/obsidian/notes/${noteId}`);
}

export async function getDueCounts(language?: string, tag?: string): Promise<Record<string, { normal: number; reverse: number; total: number }>> {
  const params: Record<string, any> = {};
  if (language) params.language = language;
  if (tag) params.tag = tag;
  const res = await api.get('/cards/due-counts', { params });
  const data = res.data;
  if (!data || typeof data !== 'object') return {};
  // With language given the backend returns a single object — normalize shape
  return language ? { [language]: data } : data;
}

// ============ AUTH API ============

export interface AuthStatus {
  auth_enabled: boolean;
  valid: boolean;
  expires_at?: string;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await api.get('/auth/me');
  const data = res.data;
  // Guard against non-JSON answers (e.g. an HTML page from a misconfigured proxy)
  if (!data || typeof data !== 'object' || typeof data.valid !== 'boolean') {
    return { auth_enabled: false, valid: true };
  }
  return { auth_enabled: !!data.auth_enabled, valid: data.valid, expires_at: data.expires_at };
}

export async function login(password: string): Promise<{ token: string; expires_at: string }> {
  const res = await api.post('/auth/login', { password });
  const data = res.data;
  if (!data || typeof data !== 'object' || typeof data.token !== 'string' || !data.token) {
    throw new Error('Unexpected login response');
  }
  setToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // token may already be invalid — clearing locally is what matters
  }
  clearToken();
}

// ============ LLM SETTINGS API ============

export interface LLMSettings {
  base_url: string;
  chat_model: string;
  embedding_model: string;
  api_key_configured: boolean;
  api_key_hint: string;
}

export async function getLLMSettings(): Promise<LLMSettings> {
  const res = await api.get('/settings/llm');
  return res.data;
}

export async function updateLLMSettings(data: {
  base_url?: string;
  api_key?: string;
  chat_model?: string;
  embedding_model?: string;
}): Promise<LLMSettings> {
  const res = await api.put('/settings/llm', data);
  return res.data;
}

export async function testLLMSettings(): Promise<{ ok: boolean; model?: string; latency_ms?: number; reply?: string; error?: string }> {
  const res = await api.post('/settings/llm/test');
  return res.data;
}

// ============ STATS API ============

export async function getDailyStats(date?: string) {
  const params: Record<string, any> = {};
  if (date) params.date = date;
  const res = await api.get('/stats/daily', { params });
  return res.data;
}

export async function getSummaryStats(days: number = 30) {
  const res = await api.get('/stats/summary', { params: { days } });
  return res.data;
}

// ============ VISUAL STATS API ============

export interface ActivityDay {
  date: string;
  cards: number;
  seconds: number;
  minutes: number;
}

export interface ActivityStats {
  days: number;
  from: string;
  to: string;
  daily: ActivityDay[];
  total_cards: number;
  total_seconds: number;
  total_minutes: number;
  active_days: number;
  hour2_days: number;
}

export async function getActivityStats(days: number = 105): Promise<ActivityStats> {
  const res = await api.get('/stats/activity', { params: { days } });
  return res.data;
}

export interface MaturityTrendPoint {
  date: string;
  total: number;
  touched: number;   // words repeated at least once (cumulative)
  few: number;       // words repeated >= 2 times
  many: number;      // words repeated >= 4 times
  touched_pct: number;
  few_pct: number;
  many_pct: number;
}

export async function getMaturityTrend(days: number = 90, points: number = 15): Promise<{
  days: number;
  total_cards: number;
  from: string;
  to: string;
  series: MaturityTrendPoint[];
}> {
  const res = await api.get('/stats/maturity-trend', { params: { days, points } });
  return res.data;
}

export interface ForecastDay {
  date: string;
  normal: number;
  reverse: number;
  total: number;
}

export async function getForecast(days: number = 14): Promise<{
  days: number;
  overdue_total: number;
  overdue_normal: number;
  overdue_reverse: number;
  forecast: ForecastDay[];
  peak_day: string | null;
  peak_total: number;
}> {
  const res = await api.get('/stats/forecast', { params: { days } });
  return res.data;
}

export interface StreakStats {
  current_streak: number;
  best_streak: number;
  last_review_date: string | null;
  days_since_last_review: number | null;
  total_active_days: number;
}

export async function getStreakStats(): Promise<StreakStats> {
  const res = await api.get('/stats/streak');
  return res.data;
}

export interface MaturityBucket {
  total: number;
  new: number;
  once: number;
  few: number;
  many: number;
}

export async function getMaturityStats(): Promise<{
  by_language: Record<string, MaturityBucket>;
  totals: MaturityBucket;
}> {
  const res = await api.get('/stats/maturity');
  return res.data;
}

export default api;
