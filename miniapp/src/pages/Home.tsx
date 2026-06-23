import React, { useEffect, useState, useCallback } from 'react';
import { initData, tgUser, tgAlert, tgHaptic } from '../tg';
import { getFlag } from '../utils/flags';
import { ConfirmModal } from '../components/ConfirmModal';
import { MatchCardSkeleton } from '../components/Skeleton';

interface Match {
  id: number;
  home_team: string;
  away_team: string;
  league: string;
  start_time: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
  result: string | null;
}

type Vote = '1' | 'X' | '2' | 'OVER' | 'UNDER';

interface VoteOption {
  value: Vote;
  label: string;
  emoji: string;
  shortLabel: string;
}

const VOTE_OPTIONS: VoteOption[] = [
  { value: '1', label: 'Ev Sahibi Kazanır', emoji: '🏠', shortLabel: '1 Kazanır' },
  { value: 'X', label: 'Beraberlik', emoji: '✖️', shortLabel: 'Berab.' },
  { value: '2', label: 'Deplasman Kazanır', emoji: '✈️', shortLabel: '2 Kazanır' },
  { value: 'OVER', label: '2.5 Üst', emoji: '⬆️', shortLabel: '2.5 ÜST' },
  { value: 'UNDER', label: '2.5 Alt', emoji: '⬇️', shortLabel: '2.5 ALT' },
];

function getVoteOption(vote: Vote): VoteOption {
  return VOTE_OPTIONS.find(o => o.value === vote) ?? VOTE_OPTIONS[0];
}

function getVoteFullLabel(vote: Vote, homeTeam: string, awayTeam: string): string {
  if (vote === '1') return `${homeTeam} Kazanır`;
  if (vote === '2') return `${awayTeam} Kazanır`;
  if (vote === 'X') return 'Beraberlik';
  if (vote === 'OVER') return '2.5 Üst (3+ gol)';
  if (vote === 'UNDER') return '2.5 Alt (0-2 gol)';
  return vote;
}

function formatTime(ts: number): string {
  const d = new Date(ts + 3 * 60 * 60 * 1000);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m} TR`;
}

function useCountdown(targetTs: number) {
  const [remaining, setRemaining] = useState(targetTs - Date.now());

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = targetTs - Date.now();
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  if (remaining <= 0) return null;
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}sa ${min}dk kaldı`;
  return `${min}dk kaldı`;
}

interface PendingVote {
  vote: Vote;
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
}

function VoteButton({
  option, selected, disabled, locked, onClick,
}: {
  option: VoteOption;
  selected: boolean;
  disabled: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || locked}
      style={{
        flex: 1, padding: '9px 4px',
        borderRadius: 10,
        border: selected
          ? '2px solid #5b86e5'
          : '1px solid rgba(255,255,255,0.1)',
        background: selected
          ? 'linear-gradient(135deg, rgba(91,134,229,0.3), rgba(54,209,220,0.15))'
          : 'rgba(255,255,255,0.04)',
        color: selected ? '#7ba8ff' : 'rgba(255,255,255,0.7)',
        fontSize: 11,
        fontWeight: selected ? 700 : 400,
        cursor: disabled || locked ? 'default' : 'pointer',
        opacity: disabled && !selected ? 0.45 : 1,
        transition: 'all 0.2s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}
    >
      <span style={{ fontSize: 16 }}>{option.emoji}</span>
      <span>{option.shortLabel}</span>
    </button>
  );
}

interface ScoreVote {
  home_guess: number;
  away_guess: number;
  is_correct: number | null;
}

interface PendingScoreVote {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  homeFlag: string;
  awayFlag: string;
  homeGuess: number;
  awayGuess: number;
}

function MatchCard({ match }: { match: Match }) {
  const [vote, setVote] = useState<Vote | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null);

  // Score vote state
  const [scoreHome, setScoreHome] = useState(0);
  const [scoreAway, setScoreAway] = useState(0);
  const [scoreLocked, setScoreLocked] = useState(false);
  const [scoreVote, setScoreVote] = useState<ScoreVote | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [pendingScoreVote, setPendingScoreVote] = useState<PendingScoreVote | null>(null);

  const isStarted = match.start_time <= Date.now();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const isLocked = vote !== null;
  const countdown = useCountdown(match.start_time);

  const homeFlag = getFlag(match.home_team);
  const awayFlag = getFlag(match.away_team);

  // Load existing vote from API
  useEffect(() => {
    if (!tgUser || !initData) return;
    fetch(`/api/prediction/vote/${match.id}?init_data=${encodeURIComponent(initData)}`)
      .then(r => r.json())
      .then(data => { if (data.vote) setVote(data.vote); })
      .catch(() => {});
  }, [match.id]);

  // Load existing score vote from API
  useEffect(() => {
    if (!tgUser || !initData) return;
    fetch(`/api/prediction/score-vote/${match.id}?init_data=${encodeURIComponent(initData)}`)
      .then(r => r.json())
      .then(data => {
        if (data.score_vote) {
          setScoreVote(data.score_vote);
          setScoreHome(data.score_vote.home_guess);
          setScoreAway(data.score_vote.away_guess);
          setScoreLocked(true);
        }
      })
      .catch(() => {});
  }, [match.id]);

  const handleVoteClick = (v: Vote) => {
    if (isStarted || loading || isLocked || !tgUser) return;
    tgHaptic('light');
    setPendingVote({
      vote: v, matchId: match.id,
      homeTeam: match.home_team, awayTeam: match.away_team,
      homeFlag, awayFlag,
    });
  };

  const handleConfirm = useCallback(async () => {
    if (!pendingVote) return;
    setLoading(true);
    setPendingVote(null);
    try {
      const res = await fetch('/api/prediction/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData, match_id: pendingVote.matchId, vote: pendingVote.vote }),
      });
      const data = await res.json();
      if (res.ok) {
        tgHaptic('medium');
        setVote(pendingVote.vote);
      } else if (res.status === 409) {
        tgAlert(data.error || 'Tahmin zaten girilmiş.');
        // Fetch the real vote from server
        if (initData) {
          const r2 = await fetch(`/api/prediction/vote/${pendingVote.matchId}?init_data=${encodeURIComponent(initData)}`);
          const d2 = await r2.json();
          if (d2.vote) setVote(d2.vote);
        }
      } else {
        tgAlert(data.error || 'Bir hata oluştu');
      }
    } catch {
      tgAlert('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  }, [pendingVote]);

  const handleCancel = () => setPendingVote(null);

  const handleScoreConfirm = useCallback(async () => {
    if (!pendingScoreVote) return;
    setScoreLoading(true);
    setPendingScoreVote(null);
    try {
      const res = await fetch('/api/prediction/score-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_data: initData,
          match_id: pendingScoreVote.matchId,
          home_guess: pendingScoreVote.homeGuess,
          away_guess: pendingScoreVote.awayGuess,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        tgHaptic('medium');
        setScoreVote({ home_guess: data.home_guess, away_guess: data.away_guess, is_correct: null });
        setScoreLocked(true);
      } else if (res.status === 409) {
        tgAlert(data.error || 'Skor tahminin zaten girilmiş.');
        if (initData) {
          const r2 = await fetch(`/api/prediction/score-vote/${pendingScoreVote.matchId}?init_data=${encodeURIComponent(initData)}`);
          const d2 = await r2.json();
          if (d2.score_vote) {
            setScoreVote(d2.score_vote);
            setScoreHome(d2.score_vote.home_guess);
            setScoreAway(d2.score_vote.away_guess);
            setScoreLocked(true);
          }
        }
      } else {
        tgAlert(data.error || 'Bir hata oluştu');
      }
    } catch {
      tgAlert('Bağlantı hatası');
    } finally {
      setScoreLoading(false);
    }
  }, [pendingScoreVote]);

  const handleScoreCancel = () => setPendingScoreVote(null);

  // --- Result evaluation for finished matches ---
  let voteIsCorrect: boolean | null = null;
  if (isFinished && vote && match.result) {
    const totalGoals = (match.home_score ?? 0) + (match.away_score ?? 0);
    if (vote === 'OVER' || vote === 'UNDER') {
      const overUnder = totalGoals >= 3 ? 'OVER' : 'UNDER';
      voteIsCorrect = vote === overUnder;
    } else {
      voteIsCorrect = vote === match.result;
    }
  }

  return (
    <>
      {pendingVote && (
        <ConfirmModal
          homeTeam={pendingVote.homeTeam}
          awayTeam={pendingVote.awayTeam}
          homeFlag={pendingVote.homeFlag}
          awayFlag={pendingVote.awayFlag}
          voteLabel={getVoteFullLabel(pendingVote.vote, pendingVote.homeTeam, pendingVote.awayTeam)}
          voteEmoji={getVoteOption(pendingVote.vote).emoji}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      {pendingScoreVote && (
        <ConfirmModal
          homeTeam={pendingScoreVote.homeTeam}
          awayTeam={pendingScoreVote.awayTeam}
          homeFlag={pendingScoreVote.homeFlag}
          awayFlag={pendingScoreVote.awayFlag}
          voteLabel={`Skor: ${pendingScoreVote.homeGuess}–${pendingScoreVote.awayGuess}`}
          voteEmoji="🎯"
          onConfirm={handleScoreConfirm}
          onCancel={handleScoreCancel}
        />
      )}

      <div style={{
        background: 'linear-gradient(135deg, rgba(26,35,64,0.9) 0%, rgba(15,23,42,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '14px 16px',
        marginBottom: 12,
        backdropFilter: 'blur(8px)',
      }}>
        {/* League + time row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🌐 {match.league}
          </span>
          {isLive ? (
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>🔴 CANLI</span>
          ) : isFinished ? (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Bitti</span>
          ) : (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatTime(match.start_time)}</span>
          )}
        </div>

        {/* Teams row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10,
        }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 18 }}>{homeFlag}</span>
            <span style={{ fontSize: 14, fontWeight: 700, marginLeft: homeFlag ? 6 : 0 }}>
              {match.home_team}
            </span>
          </div>

          {/* Score / VS */}
          <div style={{
            padding: '4px 14px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            fontSize: isFinished || isLive ? 16 : 13,
            fontWeight: 700,
            color: isFinished ? '#10b981' : isLive ? '#ef4444' : 'rgba(255,255,255,0.4)',
            minWidth: 50, textAlign: 'center',
          }}>
            {(isFinished || isLive) && match.home_score !== null
              ? `${match.home_score} – ${match.away_score}`
              : 'VS'}
          </div>

          <div style={{ flex: 1, textAlign: 'right' }}>
            <span style={{ fontSize: 14, fontWeight: 700, marginRight: awayFlag ? 6 : 0 }}>
              {match.away_team}
            </span>
            <span style={{ fontSize: 18 }}>{awayFlag}</span>
          </div>
        </div>

        {/* Countdown */}
        {!isStarted && countdown && (
          <div style={{
            textAlign: 'center', fontSize: 11, color: '#f59e0b',
            marginBottom: 10, fontWeight: 500,
          }}>
            ⏱ {countdown}
          </div>
        )}

        {/* State: finished */}
        {isFinished ? (
          <div style={{
            textAlign: 'center', padding: '10px 12px',
            background: 'rgba(255,255,255,0.04)', borderRadius: 10,
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
              {match.result === '1' ? `${match.home_team} kazandı` : match.result === '2' ? `${match.away_team} kazandı` : 'Berabere bitti'}
            </div>
            {vote && (
              <div style={{ fontSize: 13, fontWeight: 600, color: voteIsCorrect ? '#10b981' : '#ef4444' }}>
                {getVoteOption(vote).emoji} {getVoteFullLabel(vote, match.home_team, match.away_team)}
                {'  '}{voteIsCorrect ? '✅ +3 puan' : '❌ Yanlış'}
              </div>
            )}
            {!vote && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Tahmin yapılmadı</div>
            )}
          </div>
        ) : isLive ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#f59e0b' }}>
            🔴 Maç devam ediyor — tahmin süresi doldu
          </div>
        ) : isStarted ? (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Maç başladı — tahmin süresi doldu
          </div>
        ) : isLocked ? (
          /* Locked state */
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px',
            background: 'rgba(91,134,229,0.12)',
            border: '1px solid rgba(91,134,229,0.3)',
            borderRadius: 10,
          }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#7ba8ff' }}>
              {getVoteOption(vote!).emoji} {getVoteFullLabel(vote!, match.home_team, match.away_team)}
            </span>
            <span style={{ fontSize: 11, color: '#10b981' }}>✅ Gönderildi</span>
          </div>
        ) : (
          /* Vote buttons */
          <div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
              {VOTE_OPTIONS.slice(0, 3).map(opt => (
                <VoteButton
                  key={opt.value}
                  option={opt}
                  selected={vote === opt.value}
                  disabled={loading}
                  locked={isLocked}
                  onClick={() => handleVoteClick(opt.value)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {VOTE_OPTIONS.slice(3).map(opt => (
                <VoteButton
                  key={opt.value}
                  option={opt}
                  selected={vote === opt.value}
                  disabled={loading}
                  locked={isLocked}
                  onClick={() => handleVoteClick(opt.value)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Score prediction section — only for upcoming matches */}
        {match.status === 'scheduled' && !isStarted && (
          <div style={{
            marginTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 10,
          }}>
            {isFinished ? null : scoreLocked && scoreVote ? (
              /* Locked */
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '9px 14px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: 10,
              }}>
                <span style={{ fontSize: 14 }}>🎯</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>
                  Skor Tahminim: {scoreVote.home_guess}–{scoreVote.away_guess}
                </span>
                <span style={{ fontSize: 11, color: '#10b981' }}>✅ Gönderildi</span>
              </div>
            ) : (
              /* Stepper input */
              <div>
                <div style={{
                  textAlign: 'center', fontSize: 12, fontWeight: 600,
                  color: 'rgba(255,255,255,0.6)', marginBottom: 10,
                }}>
                  🎯 Kesin Skoru Tahmin Et <span style={{ color: '#f59e0b' }}>(+20 puan)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 10 }}>
                  {/* Home stepper */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => setScoreHome(v => Math.max(0, v - 1))}
                        disabled={scoreLoading}
                        style={stepperBtnStyle}
                      >−</button>
                      <span style={{ fontSize: 22, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{scoreHome}</span>
                      <button
                        onClick={() => setScoreHome(v => Math.min(20, v + 1))}
                        disabled={scoreLoading}
                        style={stepperBtnStyle}
                      >+</button>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Ev Sahibi</span>
                  </div>

                  <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>–</span>

                  {/* Away stepper */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => setScoreAway(v => Math.max(0, v - 1))}
                        disabled={scoreLoading}
                        style={stepperBtnStyle}
                      >−</button>
                      <span style={{ fontSize: 22, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{scoreAway}</span>
                      <button
                        onClick={() => setScoreAway(v => Math.min(20, v + 1))}
                        disabled={scoreLoading}
                        style={stepperBtnStyle}
                      >+</button>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Deplasman</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!tgUser || scoreLoading) return;
                    tgHaptic('light');
                    setPendingScoreVote({
                      matchId: match.id,
                      homeTeam: match.home_team,
                      awayTeam: match.away_team,
                      homeFlag, awayFlag,
                      homeGuess: scoreHome,
                      awayGuess: scoreAway,
                    });
                  }}
                  disabled={scoreLoading}
                  style={{
                    width: '100%', padding: '10px 0',
                    borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: scoreLoading ? 'default' : 'pointer',
                    opacity: scoreLoading ? 0.6 : 1,
                  }}
                >
                  {scoreLoading ? '⏳ Gönderiliyor...' : 'Skoru Onayla →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Score result — finished */}
        {isFinished && scoreVote && (
          <div style={{
            marginTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingTop: 8,
            textAlign: 'center',
            fontSize: 13, fontWeight: 600,
          }}>
            {scoreVote.is_correct === 1 ? (
              <span style={{ color: '#10b981' }}>
                🎯 {scoreVote.home_guess}–{scoreVote.away_guess} → ✅ +20 puan
              </span>
            ) : scoreVote.is_correct === 0 ? (
              <span style={{ color: '#ef4444' }}>
                🎯 {scoreVote.home_guess}–{scoreVote.away_guess} → ❌ Yanlış
              </span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                🎯 {scoreVote.home_guess}–{scoreVote.away_guess} (değerlendiriliyor)
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const stepperBtnStyle: React.CSSProperties = {
  width: 32, height: 32,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: 18, fontWeight: 700,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
};

export default function Home() {
  const [todayMatches, setTodayMatches] = useState<Match[]>([]);
  const [tomorrowMatches, setTomorrowMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/prediction/matches')
      .then(r => r.json())
      .then(data => {
        const active = (m: Match) => m.status !== 'finished';
        setTodayMatches((data.today || []).filter(active));
        setTomorrowMatches((data.tomorrow || []).filter(active));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{
        padding: '18px 16px 10px',
        fontSize: 20, fontWeight: 800,
        background: 'linear-gradient(90deg, #5b86e5, #36d1dc)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        🎯 Tahmin Et
      </div>

      <div style={{ padding: '0 12px' }}>
        {loading ? (
          <>
            <MatchCardSkeleton />
            <MatchCardSkeleton />
          </>
        ) : (
          <>
            {todayMatches.length > 0 && (
              <>
                <div style={{
                  padding: '8px 4px', fontSize: 12, fontWeight: 600,
                  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  🗓 Bugün
                </div>
                {todayMatches.map(m => <MatchCard key={m.id} match={m} />)}
              </>
            )}
            {tomorrowMatches.length > 0 && (
              <>
                <div style={{
                  padding: '8px 4px', fontSize: 12, fontWeight: 600,
                  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  📅 Yarın
                </div>
                {tomorrowMatches.map(m => <MatchCard key={m.id} match={m} />)}
              </>
            )}
            {todayMatches.length === 0 && tomorrowMatches.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚽</div>
                Bugün ve yarın takip edilen maç yok.<br />
                Yakında güncellenir 🔄
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
