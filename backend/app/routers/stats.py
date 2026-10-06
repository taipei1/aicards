from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone, timedelta, date

from app.database import get_db
from app.models import User, SessionStats, Card

router = APIRouter()


# Helper: Get or create default user (single-user mode)
def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def _minutes(seconds: int) -> float:
    return round((seconds or 0) / 60.0, 1)


@router.get("/daily")
def get_daily_stats(
    date: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get time spent on given date (real seconds, not the old card counter)."""
    if not date:
        date = datetime.now(timezone.utc).date().isoformat()

    stats = db.query(SessionStats).filter(
        SessionStats.user_id == user.id,
        SessionStats.session_date == date
    ).all()

    total_seconds = sum(s.seconds_spent or 0 for s in stats)
    by_category_minutes = {}
    by_category_cards = {}

    for stat in stats:
        key = stat.category or "general"
        by_category_minutes[key] = round(
            by_category_minutes.get(key, 0) + _minutes(stat.seconds_spent or 0), 1
        )
        by_category_cards[key] = by_category_cards.get(key, 0) + (stat.card_count or 0)

    return {
        "date": date,
        "total_minutes": _minutes(total_seconds),
        "total_seconds": total_seconds,
        "card_count": sum(s.card_count or 0 for s in stats),
        "by_category": by_category_minutes,
        "cards_by_category": by_category_cards,
    }


@router.get("/summary")
def get_summary(
    days: int = 30,
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Summary for a period.

    Default is "the last N days", but an explicit inclusive `start`/`end`
    (ISO dates) wins when both are given — the UI needs a Monday→Sunday week
    and the matching window of the previous week.
    """
    if start and end:
        stats = db.query(SessionStats).filter(
            SessionStats.user_id == user.id,
            SessionStats.session_date >= start,
            SessionStats.session_date <= end
        ).all()
        period_days = (date.fromisoformat(end) - date.fromisoformat(start)).days + 1
    else:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
        stats = db.query(SessionStats).filter(
            SessionStats.user_id == user.id,
            SessionStats.session_date >= start_date
        ).all()
        period_days = days

    total_seconds = sum(s.seconds_spent or 0 for s in stats)
    by_module = {}
    by_category = {}

    for stat in stats:
        key_minutes = _minutes(stat.seconds_spent or 0)
        by_module[stat.module_type] = round(
            by_module.get(stat.module_type, 0) + key_minutes, 1
        )
        key = stat.category or "general"
        by_category[key] = round(by_category.get(key, 0) + key_minutes, 1)

    active_days = len({s.session_date for s in stats})

    return {
        "period_days": period_days,
        "from": start,
        "to": end,
        "total_minutes": _minutes(total_seconds),
        "total_seconds": total_seconds,
        "avg_per_day": _minutes(total_seconds / period_days) if period_days > 0 else 0,
        "active_days": active_days,
        "total_cards": sum(s.card_count or 0 for s in stats),
        "by_module": by_module,
        "by_category": by_category,
    }


@router.get("/activity")
def get_activity(
    days: int = Query(105, description="Window size, e.g. 105 = 15 weeks"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Per-day review counts and seconds for a calendar heatmap / bar chart."""
    since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date()

    rows = db.execute(text("""
        SELECT r.review_time::date AS day,
               count(*) AS cards,
               COALESCE(sum(r.time_spent_seconds), 0) AS seconds
        FROM reviews r
        WHERE r.user_id = :uid AND r.review_time::date >= :since
        GROUP BY day
        ORDER BY day
    """), {"uid": user.id, "since": since}).fetchall()

    per_day = {
        r.day.isoformat(): {
            "date": r.day.isoformat(),
            "cards": r.cards,
            "seconds": int(r.seconds or 0),
            "minutes": _minutes(r.seconds),
        }
        for r in rows
    }

    # Fill gaps so the frontend can render a continuous grid
    filled = []
    today = datetime.now(timezone.utc).date()
    cursor = since
    while cursor <= today:
        key = cursor.isoformat()
        filled.append(per_day.get(key, {"date": key, "cards": 0, "seconds": 0, "minutes": 0.0}))
        cursor += timedelta(days=1)

    active_days = [d for d in filled if d["cards"] > 0]
    # Days with more than two hours of study (7200s), from real review time.
    hour2_days = sum(1 for d in filled if d["seconds"] > 7200)
    return {
        "days": days,
        "from": since.isoformat(),
        "to": today.isoformat(),
        "daily": filled,
        "total_cards": sum(d["cards"] for d in filled),
        "total_seconds": sum(d["seconds"] for d in filled),
        "total_minutes": _minutes(sum(d["seconds"] for d in filled)),
        "active_days": len(active_days),
        "hour2_days": hour2_days,
    }


@router.get("/streak")
def get_streak(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Current / best streak of consecutive days with at least one review."""
    rows = db.execute(text("""
        SELECT DISTINCT r.review_time::date AS day
        FROM reviews r
        WHERE r.user_id = :uid
        ORDER BY day
    """), {"uid": user.id}).fetchall()

    days = [r.day for r in rows]
    if not days:
        return {
            "current_streak": 0,
            "best_streak": 0,
            "last_review_date": None,
            "days_since_last_review": None,
            "total_active_days": 0,
        }

    # Current streak: walk backwards from today (or yesterday — today may
    # simply not have happened yet).
    today = datetime.now(timezone.utc).date()
    day_set = set(days)

    current = 0
    cursor = today if today in day_set else today - timedelta(days=1)
    while cursor in day_set:
        current += 1
        cursor -= timedelta(days=1)

    best = 0
    run = 0
    prev = None
    for d in days:
        if prev is not None and d == prev + timedelta(days=1):
            run += 1
        else:
            run = 1
        best = max(best, run)
        prev = d

    return {
        "current_streak": current,
        "best_streak": best,
        "last_review_date": days[-1].isoformat(),
        "days_since_last_review": (today - days[-1]).days,
        "total_active_days": len(days),
    }


@router.get("/maturity")
def get_maturity(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Deck composition by how many times a word was actually repeated.

    Deliberately based on review counts rather than FSRS stability: stability
    was seeded from card age on import and reaches absurd values (3000+
    days), so a stability-based "mastered" split would read ~100%.
    """
    rows = db.execute(text("""
        SELECT c.language,
               count(*) AS total,
               count(*) FILTER (WHERE COALESCE(rc.n, 0) = 0) AS fresh,
               count(*) FILTER (WHERE COALESCE(rc.n, 0) = 1) AS seen_once,
               count(*) FILTER (WHERE COALESCE(rc.n, 0) BETWEEN 2 AND 3) AS seen_few,
               count(*) FILTER (WHERE rc.n >= 4) AS seen_many
        FROM cards c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN (
            SELECT card_id, count(*) AS n FROM reviews GROUP BY card_id
        ) rc ON rc.card_id = c.id
        WHERE u.username = 'default'
        GROUP BY c.language
        ORDER BY c.language
    """))

    by_language = {}
    for r in rows:
        by_language[r.language] = {
            "total": r.total,
            "new": r.fresh,
            "once": r.seen_once,
            "few": r.seen_few,
            "many": r.seen_many,
        }

    totals = {"total": 0, "new": 0, "once": 0, "few": 0, "many": 0}
    for v in by_language.values():
        for k in totals:
            totals[k] += v[k]

    return {"by_language": by_language, "totals": totals}


@router.get("/maturity-trend")
def get_maturity_trend(
    days: int = Query(90, description="Window of the trend in days"),
    points: int = Query(15, description="Number of sampled points (dates) in the series"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Deck maturity over time — several curves, not one number.

    Maturity is measured by how many times each word has actually been
    repeated (review counts, not FSRS stability: stability was seeded from
    card age on import and reaches absurd values, so a stability-based split
    reads ~100% mastered). For each sampled date we count, over the whole
    deck, how many words have cumulative repeats >= 1, >= 2 and >= 4 — so the
    chart shows the deck growing from "new" to "seen" to "drilled".

    Buckets are computed per (card, day) with a ceiling of 4 to keep the
    intermediate data tiny; every word is counted at each snapshot date.
    """
    horizon = max(2, days)
    npoints = max(2, min(60, points))
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=horizon - 1)

    rows = db.execute(text("""
        SELECT r.card_id, r.review_time::date AS day, count(*)::int AS n
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        JOIN users u ON u.id = c.user_id
        WHERE u.username = 'default'
        GROUP BY r.card_id, r.review_time::date
    """)).fetchall()

    # per card: sorted [(day, cumulative_repeats_at_that_day)] capped at 4
    per_card: dict = {}
    for r in rows:
        if r.day is None:
            continue
        arr = per_card.setdefault(r.card_id, {})
        arr[r.day] = arr.get(r.day, 0) + r.n
    cards_days = [(cid, sorted(by_day.items())) for cid, by_day in per_card.items()]

    total_cards = db.query(Card).filter(Card.user_id == user.id).count()

    def snapshot(day: date):
        """Counts over the deck at end of `day`, capped at 1/2/4 repeats."""
        touched = few = many = 0
        for _cid, by_day in cards_days:
            cum = 0
            for d, n in by_day:
                if d <= day:
                    cum += n
                else:
                    break
            if cum >= 1:
                touched += 1
            if cum >= 2:
                few += 1
            if cum >= 4:
                many += 1
        return touched, few, many

    denom = max(1, total_cards)
    step = (horizon - 1) / (npoints - 1)
    series = []
    seen_dates = set()
    for i in range(npoints):
        d = start + timedelta(days=round(i * step))
        if d in seen_dates:
            continue
        seen_dates.add(d)
        touched, few, many = snapshot(d)
        series.append({
            "date": d.isoformat(),
            "total": total_cards,
            "touched": touched,                      # >= 1 повтор
            "few": few,                              # >= 2 повтора
            "many": many,                            # >= 4 повторов
            "touched_pct": round(touched / denom * 100, 1),
            "few_pct": round(few / denom * 100, 1),
            "many_pct": round(many / denom * 100, 1),
        })

    return {
        "days": horizon,
        "total_cards": total_cards,
        "from": series[0]["date"] if series else start.isoformat(),
        "to": series[-1]["date"] if series else today.isoformat(),
        "series": series,
    }


@router.get("/forecast")
def get_forecast(
    days: int = Query(14, description="How many days ahead to project"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Due load for the coming days.

    Only cards that have been reviewed at least once are scheduled — a card
    never repeated has no due date, and counting all of them would bury the
    forecast under thousands of "new" items.
    """
    horizon_days = max(1, days)
    today = datetime.now(timezone.utc).date()

    # normal cards
    normal_rows = db.execute(text("""
        SELECT c.language,
               (c.last_reviewed + make_interval(days => round(c.stability::numeric)::int))::date AS due
        FROM cards c
        JOIN users u ON u.id = c.user_id
        WHERE u.username = 'default' AND c.last_reviewed IS NOT NULL
    """)).fetchall()

    # reverse cards
    reverse_rows = db.execute(text("""
        SELECT c.language,
               (r.last_reviewed + make_interval(days => round(r.stability::numeric)::int))::date AS due
        FROM card_reverses r
        JOIN cards c ON c.id = r.card_id
        JOIN users u ON u.id = c.user_id
        WHERE u.username = 'default' AND r.last_reviewed IS NOT NULL
    """)).fetchall()

    buckets = {}
    for offset in range(horizon_days + 1):
        d = today + timedelta(days=offset)
        buckets[d.isoformat()] = {"date": d.isoformat(), "normal": 0, "reverse": 0}

    overdue_normal = 0
    overdue_reverse = 0
    for lang, due in normal_rows:
        if due < today:
            overdue_normal += 1
            continue
        key = due.isoformat()
        if key in buckets:
            buckets[key]["normal"] += 1

    for lang, due in reverse_rows:
        if due < today:
            overdue_reverse += 1
            continue
        key = due.isoformat()
        if key in buckets:
            buckets[key]["reverse"] += 1

    series = []
    for v in buckets.values():
        v["total"] = v["normal"] + v["reverse"]
        series.append(v)

    return {
        "days": horizon_days,
        "overdue_normal": overdue_normal,
        "overdue_reverse": overdue_reverse,
        "overdue_total": overdue_normal + overdue_reverse,
        "forecast": series,
        "peak_day": max(series, key=lambda x: x["total"])["date"] if series else None,
        "peak_total": max((x["total"] for x in series), default=0),
    }


@router.get("/progress")
def get_progress(
    module: str = "language",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get learning progress."""
    from app.models import Card, CardReverse, ObsidianNote

    if module == "language":
        total_cards = db.query(Card).filter(Card.user_id == user.id).count()
        total_reverses = db.query(CardReverse).join(Card, CardReverse.card_id == Card.id).filter(
            Card.user_id == user.id
        ).count()
        by_lang = {}
        for lang in ["en", "sk"]:
            count = db.query(Card).filter(
                Card.user_id == user.id,
                Card.language == lang
            ).count()
            by_lang[lang] = count

        return {
            "module": module,
            "total_cards": total_cards,
            "total_reverses": total_reverses,
            "total_items": total_cards + total_reverses,
            "by_language": by_lang
        }
    else:
        total = db.query(ObsidianNote).filter(
            ObsidianNote.user_id == user.id
        ).count()

        return {
            "module": module,
            "total_notes": total
        }