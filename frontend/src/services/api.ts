import axios from 'axios';
import type { Card, ReviewCreate, ReviewResponse, CSVImportRequest, CSVImportResponse } from '../types';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============ CARDS API ============

export async function getCardsDue(language: string, limit: number = 20): Promise<Card[]> {
  const res = await api.get('/cards/due', { params: { language, limit } });
  return res.data;
}

export async function searchCards(
  language: string,
  tag?: string,
  search?: string,
  limit: number = 50
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

// ============ REVIEWS API ============

export async function logReview(review: ReviewCreate): Promise<ReviewResponse> {
  const res = await api.post('/reviews/', review);
  return res.data;
}

export async function getCardReviewHistory(cardId: number, limit: number = 10) {
  const res = await api.get(`/reviews/${cardId}/history`, { params: { limit } });
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

export async function getDueNotes(limit: number = 5) {
  const res = await api.get('/obsidian/due', { params: { limit } });
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

export default api;
