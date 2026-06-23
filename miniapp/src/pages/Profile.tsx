import { useEffect, useState } from 'react';
import { tgUser } from '../tg';

interface UserStats {
  user_id: number;
  username: string | null;
  first_name: string | null;
  total_points: number;
  total_predictions: number;
  correct_predictions: number;
  recent_votes: RecentVote[];
  recent_score_votes: RecentScoreVote[];
}

interface RecentScoreVote {
  match_id: number;
  home_guess: number;
  away_guess: number;
  is_correct: number | null;
  home_team: string;
  away_team: string;
  league: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

interface RecentVote {
  match_id: number;
  vote: string;
  is_correct: number | null;
  home_team: string;
  away_team: string;
  league: string;
  home_score: number | null;
  away_score: number | null;
  match_result: string | null;
}

function calcStreak(votes: RecentVote[]): number {
  let streak = 0;
  for (const v of votes) {
    if (v.is_correct === 1) streak++;
    else if (v.is_correct === 0) break;
    // null (pending) — skip, don't break
  }
  return streak;
}

function voteLabel(vote: string, home: string, away: string): string {
  if (vote === '1') return `${home} Kazanır`;
  if (vote === '2') return `${away} Kazanır`;
  if (vote === 'X') return 'Beraberlik';
  if (vote === 'OVER') return '⬆️ 2.5 Üst';
  if (vote === 'UNDER') return '⬇️ 2.5 Alt';
  return vote;
}

function hashColor(userId: number): string {
  const hue = (userId * 137.508) % 360;
  return `hsl(${hue}, 60%, 42%)`;
}

export default function Profile() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tgUser?.id) { setLoading(false); setNotFound(true); return; }
    fetch(`/api/prediction/user/${tgUser.id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(data => { if (data) setStats(data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 30,
          background: 'rgba(255,255,255,0.06)',
          margin: '0 auto 16px',
          animation: 'pulse 1.5s infinite',
        }} />
        Yükleniyor...
      </div>
    );
  }

  if (notFound || !stats) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎯</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
          Henüz tahmin yapmadın!
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1.6 }}>
          Grupta paylaşılan maçları tahmin ederek<br />puan kazanmaya başla.
        </div>
      </div>
    );
  }

  const accuracy = stats.total_predictions > 0
    ? Math.round((stats.correct_predictions / stats.total_predictions) * 100)
    : 0;

  const streak = calcStreak(stats.recent_votes);
  const displayName = stats.username ? `@${stats.username}` : stats.first_name || 'Anonim';
  const initial = displayName.replace('@', '').charAt(0).toUpperCase();
  const avatarColor = hashColor(stats.user_id);

  const statBox = (value: string, label: string, color = '#fff') => (
    <div style={{
      flex: 1,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '14px 8px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* Header gradient */}
      <div style={{
        padding: '24px 16px 20px',
        background: 'linear-gradient(180deg, rgba(91,134,229,0.12) 0%, transparent 100%)',
        textAlign: 'center',
      }}>
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: 36,
          background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, fontWeight: 800, color: '#fff',
          margin: '0 auto 12px',
          boxShadow: `0 8px 24px ${avatarColor}55`,
        }}>
          {initial}
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{displayName}</div>

        {/* Points badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'linear-gradient(135deg, rgba(91,134,229,0.2), rgba(54,209,220,0.1))',
          border: '1px solid rgba(91,134,229,0.3)',
          borderRadius: 20, padding: '4px 14px',
          fontSize: 13, fontWeight: 700, color: '#7ba8ff',
        }}>
          ⭐ {stats.total_points} puan
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {statBox(`%${accuracy}`, 'Doğruluk', accuracy >= 60 ? '#10b981' : accuracy >= 40 ? '#f59e0b' : '#ef4444')}
          {statBox(`${stats.correct_predictions}/${stats.total_predictions}`, 'Doğru/Toplam', '#7ba8ff')}
          {statBox(streak > 0 ? `🔥 ${streak}` : '0', 'Seri', streak >= 3 ? '#f59e0b' : '#fff')}
        </div>

        {/* Accuracy bar */}
        {stats.total_predictions > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              <span>Doğruluk Oranı</span>
              <span>%{accuracy}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <div style={{
                width: `${accuracy}%`, height: '100%',
                background: 'linear-gradient(90deg, #5b86e5, #36d1dc)',
                borderRadius: 3, transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        )}

        {/* Recent predictions */}
        {stats.recent_votes.length > 0 && (
          <>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
            }}>
              Son Tahminler
            </div>
            {stats.recent_votes.map((v, idx) => (
              <div
                key={`${v.match_id}-${idx}`}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                  borderLeft: `3px solid ${v.is_correct === null ? 'rgba(255,255,255,0.15)' : v.is_correct ? '#10b981' : '#ef4444'}`,
                }}
              >
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                  {v.league}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 5 }}>
                  {v.home_team} vs {v.away_team}
                  {v.home_score !== null && (
                    <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
                      ({v.home_score}–{v.away_score})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {voteLabel(v.vote, v.home_team, v.away_team)}
                  </span>
                  <span style={{ fontWeight: 600, color: v.is_correct === null ? '#f59e0b' : v.is_correct ? '#10b981' : '#ef4444' }}>
                    {v.is_correct === null ? '⏳ Bekleniyor' : v.is_correct ? '✅ +3 puan' : '❌ Yanlış'}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Score predictions */}
        {stats.recent_score_votes?.length > 0 && (
          <>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase', letterSpacing: 0.5,
              marginTop: 20, marginBottom: 10,
            }}>
              🎯 Skor Tahminlerim
            </div>
            {stats.recent_score_votes.map((sv, idx) => {
              const pending = sv.is_correct === null;
              const correct = sv.is_correct === 1;
              const accentColor = pending ? 'rgba(255,255,255,0.15)' : correct ? '#f59e0b' : '#ef4444';
              return (
                <div
                  key={`sv-${sv.match_id}-${idx}`}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                    borderLeft: `3px solid ${accentColor}`,
                  }}
                >
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                    {sv.league}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                    {sv.home_team} vs {sv.away_team}
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Tahminin:</span>
                      <span style={{
                        fontWeight: 700, fontSize: 15,
                        background: 'rgba(245,158,11,0.1)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 8, padding: '2px 10px',
                        color: '#f59e0b',
                      }}>
                        {sv.home_guess} – {sv.away_guess}
                      </span>
                      {sv.home_score !== null && (
                        <>
                          <span style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
                            {sv.home_score} – {sv.away_score}
                          </span>
                        </>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, color: pending ? '#f59e0b' : correct ? '#10b981' : '#ef4444' }}>
                      {pending ? '⏳ Bekl.' : correct ? '✅ +20 puan' : '❌ Yanlış'}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
