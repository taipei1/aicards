export interface Card {
  id: number;
  front: string;
  back: string;
  hint?: string;
  language: string;
  tags: string[];
  stability: number;
  difficulty: number;
  last_reviewed?: string;
  created_at?: string;
}

export interface Review {
  id: number;
  rating: number;
  review_time?: string;
  stability_after?: number;
  interval_days?: number;
  time_spent_seconds?: number;
}

export interface ReviewCreate {
  card_id: number;
  rating: 1 | 2 | 3 | 4;
  elapsed_days?: number;
  time_spent_seconds?: number;
}

export interface ReviewResponse {
  success: boolean;
  next_review_in_days: number;
  stability: number;
  difficulty: number;
}

export interface CSVImportRequest {
  csv_content: string;
  language: string;
}

export interface CSVImportResponse {
  imported: number;
  duplicates: number;
  conflicts: Array<{
    front: string;
    existing_back: string;
    existing_tags: string[];
  }>;
}

export interface DailyStats {
  date: string;
  total_minutes: number;
  by_category: Record<string, number>;
}
