import React, { useState } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, ArrowRight, Trophy, Home, Droplets } from 'lucide-react';
import { GameState, Player, RoundOutcome, TurnPhase } from '../types/game';
import { CALIBRATION_TIERS, CalibrationLevel, waterAudio } from '../audio/waterAudioEngine';

interface GameHUDProps {
  gameState: GameState;
  roundNumber: number;
  players: Player[];
  currentPlayer: Player | null;
  muted: boolean;
  onToggleMute: () => void;
  onOpenPause: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  roundNumber,
  players,
  currentPlayer,
  muted,
  onToggleMute,
  onOpenPause,
}) => {
  const aliveCount = players.filter((p) => !p.isEliminated).length;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 p-3 sm:p-5 flex items-start justify-between gap-4">
      {/* Top-left Clean Unboxed Perimeter Status */}
      <div className="bg-[#111622]/75 border border-white/10 rounded-xl px-3.5 py-2.5 flex flex-col gap-1.5 max-w-[68vw] sm:max-w-md">
        <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-200/90 font-medium">
          <span className="font-mono-num font-bold text-amber-300">第 {roundNumber} 瓶</span>
          <span aria-hidden="true" className="text-white/30">·</span>
          <span className="font-mono-num">生還 {aliveCount}/{players.length} 人</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {players.map((p) => {
            const isCurrent = currentPlayer?.id === p.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 ${
                  p.isEliminated
                    ? 'opacity-40 line-through text-slate-400'
                    : isCurrent
                    ? 'text-white font-bold'
                    : 'text-slate-300'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: p.isEliminated ? '#64748B' : p.color }}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[78px]">{p.name}</span>
                {isCurrent && !p.isEliminated && (
                  <span className="text-sky-300 text-[11px] font-bold">輪到</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top-right Controls (>= 44px touch targets) */}
      <div className="pointer-events-auto flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleMute}
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#111622]/85 border border-white/15 text-[#FBF5E6] hover:border-sky-400/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          aria-label={muted ? '開啟音效' : '靜音'}
        >
          {muted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-sky-400" />}
          <span className="hidden sm:inline text-xs font-medium">{muted ? '靜音' : '聲音'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenPause}
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-[#111622]/85 border border-white/15 text-[#FBF5E6] hover:border-amber-300/50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          aria-label="暫停與規則"
        >
          <Pause className="w-5 h-5 text-amber-300" />
          <span className="hidden sm:inline text-xs font-medium">暫停</span>
        </button>
      </div>
    </div>
  );
};

interface PassDeviceOverlayProps {
  player: Player;
  roundNumber: number;
  muted: boolean;
  onConfirmReady: () => void;
  onUnmute: () => void;
}

export const PassDeviceOverlay: React.FC<PassDeviceOverlayProps> = ({
  player,
  roundNumber,
  muted,
  onConfirmReady,
  onUnmute,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-5 bg-[#0A0E17]/75">
      <div className="w-full max-w-md bg-[#181F30] border border-amber-200/25 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col items-center text-center gap-5">
        <div className="flex items-center gap-2 text-xs text-amber-300/90 font-mono-num">
          <span>第 {roundNumber} 瓶挑戰</span>
          <span aria-hidden="true">·</span>
          <span>傳遞接力</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="w-4 h-4 rounded-sm shrink-0"
              style={{ backgroundColor: player.color }}
              aria-hidden="true"
            />
            <h2 className="text-2xl sm:text-3xl font-black text-[#FBF5E6] tracking-wide">
              請交給 {player.name}
            </h2>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            拿穩裝置並豎起耳朵！按住畫面開始倒水，聽到水聲變尖變大聲就要小心停手。
          </p>
        </div>

        {muted && (
          <button
            type="button"
            onClick={onUnmute}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 cursor-pointer hover:bg-rose-500/30 transition-colors"
          >
            <VolumeX className="w-4 h-4 shrink-0" />
            <span>目前為靜音狀態，點此開啟聲音才能聽聲辨位</span>
          </button>
        )}

        <button
          type="button"
          onClick={onConfirmReady}
          className="w-full min-h-[52px] px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 active:scale-[0.98] text-slate-950 font-black text-base tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <Droplets className="w-5 h-5" />
          <span>我拿到了，準備倒水</span>
        </button>
      </div>
    </div>
  );
};

interface ActiveTurnBarProps {
  player: Player;
  turnPhase: TurnPhase;
  tooShortHint: boolean;
  onConfirmHandoff: () => void;
}

export const ActiveTurnBar: React.FC<ActiveTurnBarProps> = ({
  player,
  turnPhase,
  tooShortHint,
  onConfirmHandoff,
}) => {
  if (turnPhase === 'OVERFLOWED') return null;

  if (turnPhase === 'LOCKED') {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 p-4 sm:p-6 flex justify-center">
        <div className="pointer-events-auto w-full max-w-md bg-[#181F30]/95 border border-emerald-400/40 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-center sm:text-left">
            <div className="text-sm font-bold text-emerald-300">安全停手！這次沒滿出來</div>
            <div className="text-xs text-slate-300">水位已推進，準備交給下一位試膽</div>
          </div>
          <button
            type="button"
            onClick={onConfirmHandoff}
            className="w-full sm:w-auto min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] text-slate-950 font-black text-sm tracking-wide transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>確認並交棒</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 p-4 sm:p-5 flex justify-center">
      <div className="bg-[#111622]/80 border border-white/10 rounded-xl px-4 py-2.5 text-center max-w-md">
        {turnPhase === 'POURING' ? (
          <div className="text-xs sm:text-sm font-bold text-sky-300">
            {player.name} 正在倒水… 仔細聽水聲變化，隨時放開停手
          </div>
        ) : tooShortHint ? (
          <div className="text-xs sm:text-sm font-bold text-amber-300">
            按太短囉！請再按住一點點（水龍頭綠燈亮起才算完成）
          </div>
        ) : (
          <div className="text-xs sm:text-sm text-slate-200">
            長按螢幕任意處或空白鍵開啟水龍頭（至少 0.4 秒）
          </div>
        )}
      </div>
    </div>
  );
};

interface RoundRevealBarProps {
  outcome: RoundOutcome;
  hasNextRound: boolean;
  onNextRound: () => void;
}

export const RoundRevealBar: React.FC<RoundRevealBarProps> = ({
  outcome,
  hasNextRound,
  onNextRound,
}) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3 sm:p-5 flex justify-center">
      <div className="pointer-events-auto w-full max-w-xl bg-[#181F30]/95 border border-rose-400/40 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-rose-300 font-bold tracking-wide">
              滿溢爆發 · 第 {outcome.roundNumber} 瓶揭曉
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[#FBF5E6]">
              {outcome.loserName} 讓彈珠汽水溢出來了！
            </h3>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-slate-400">最終揭曉水位</div>
            <div className="text-xl font-black font-mono-num text-rose-400">
              {Math.round(outcome.finalRatio * 100)}%
            </div>
          </div>
        </div>

        {/* Color-coded pour contribution summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-200 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1E76A8]" aria-hidden="true" />
            <span className="font-mono-num">初始隨機 {Math.round(outcome.initialRatio * 100)}%</span>
          </div>
          {outcome.segments.map((seg, i) => {
            const addedPct = Math.max(1, Math.round((seg.endRatio - seg.startRatio) * 100));
            return (
              <div key={`${seg.playerId}-${i}`} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} aria-hidden="true" />
                <span>{seg.playerName}</span>
                <span className="font-mono-num text-slate-400">+{addedPct}%</span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onNextRound}
          className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 active:scale-[0.98] text-slate-950 font-black text-sm sm:text-base transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
        >
          <span>{hasNextRound ? `開啟下一瓶新水瓶（剩 ${outcome.survivingCount} 人）` : '揭曉最終夜市冠軍'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  winner: Player;
  players: Player[];
  onPlayAgain: () => void;
  onBackToTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  players,
  onPlayAgain,
  onBackToTitle,
}) => {
  const sorted = [...players].sort((a, b) => {
    if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
    return b.survivedTurns - a.survivedTurns;
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#080C14]/82">
      <div className="w-full max-w-md bg-[#181F30] border border-amber-300/35 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-amber-400/15 border border-amber-300/35 flex items-center justify-center text-amber-300">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="text-xs text-amber-300 font-bold tracking-wider">夜市聽聲神手誕生</div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#FBF5E6]">
            恭喜 {winner.name} 奪冠！
          </h2>
          <p className="text-sm text-slate-300">
            全場精準聽音辨位，成功在總計 <span className="font-mono-num font-bold text-sky-300">{winner.survivedTurns}</span> 次驚險倒水中全身而退。
          </p>
        </div>

        <div className="flex flex-col divide-y divide-white/10 border-y border-white/10 py-1">
          {sorted.map((p, idx) => (
            <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono-num text-xs text-slate-400 w-5">#{idx + 1}</span>
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: p.color }} aria-hidden="true" />
                <span className={`truncate font-bold ${p.id === winner.id ? 'text-amber-300' : 'text-slate-200'}`}>
                  {p.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono-num shrink-0">
                <span className="text-slate-300">撐過 {p.survivedTurns} 回</span>
                <span className={p.isEliminated ? 'text-rose-400' : 'text-emerald-400 font-bold'}>
                  {p.isEliminated ? '溢出出局' : '最終冠軍'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>原班人馬再玩一局</span>
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#101522] border border-white/15 hover:border-white/30 text-slate-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Home className="w-4 h-4" />
            <span>回主畫面</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface PauseModalProps {
  muted: boolean;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  muted,
  onToggleMute,
  onResume,
  onRestart,
  onBackToTitle,
}) => {
  const [activeSample, setActiveSample] = useState<CalibrationLevel | null>(null);

  const playCalibration = (level: CalibrationLevel) => {
    if (muted) onToggleMute();
    setActiveSample(level);
    waterAudio.playSampleCalibration(level, () => {
      setActiveSample((prev) => (prev === level ? null : prev));
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080C14]/82">
      <div className="w-full max-w-md bg-[#181F30] border border-amber-200/25 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#FBF5E6]">遊戲暫停與規則說明</h2>
          <button
            type="button"
            onClick={onToggleMute}
            className="min-h-[40px] px-3 rounded-lg bg-[#101522] border border-white/15 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}
            <span>{muted ? '開啟音效' : '靜音'}</span>
          </button>
        </div>

        <ul className="text-xs sm:text-sm text-slate-300 space-y-2 leading-relaxed">
          <li>1. 每瓶開局水位與容量皆隨機生成，瓶身完全遮蔽。</li>
          <li>2. 按住畫面或空白鍵開水龍頭，水聲會隨水位升高而變得更尖銳、更響亮。</li>
          <li>3. 每次倒水至少需達 0.4 秒（水龍頭亮綠燈），放開即可停手並交棒給下一位。</li>
          <li>4. 讓水滿出瓶口的人該局出局，最後生還者獲勝！</li>
        </ul>

        <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
          <div className="text-xs text-slate-400">快速重聽 5 段水位音階</div>
          <div className="grid grid-cols-5 gap-1.5">
            {CALIBRATION_TIERS.map((tier) => {
              const isPlaying = activeSample === tier.key;
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => playCalibration(tier.key)}
                  className={`min-h-[44px] px-1.5 py-1.5 rounded-lg border text-[11px] font-medium font-mono-num transition-colors cursor-pointer flex flex-col items-center justify-center ${
                    isPlaying
                      ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                      : 'bg-[#101522] border-white/10 hover:border-sky-400/50 text-slate-200'
                  }`}
                >
                  <span className="whitespace-nowrap">{Math.round(tier.ratio * 100)}%</span>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {isPlaying ? '播放' : tier.label.split(' ')[1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>繼續遊戲</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRestart}
              className="min-h-[44px] rounded-xl bg-[#101522] border border-white/15 hover:border-white/30 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>重新開局</span>
            </button>
            <button
              type="button"
              onClick={onBackToTitle}
              className="min-h-[44px] rounded-xl bg-[#101522] border border-white/15 hover:border-white/30 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              <span>回主畫面</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
