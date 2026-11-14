import React, { useState } from 'react';
import { Volume2, VolumeX, Play, Users } from 'lucide-react';
import { CALIBRATION_TIERS, CalibrationLevel, waterAudio } from '../audio/waterAudioEngine';
import { PLAYER_PALETTE } from '../types/game';

interface TitleScreenProps {
  playerCount: number;
  playerNames: string[];
  muted: boolean;
  onChangePlayerCount: (count: number) => void;
  onChangePlayerName: (index: number, name: string) => void;
  onToggleMute: () => void;
  onStartGame: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  playerCount,
  playerNames,
  muted,
  onChangePlayerCount,
  onChangePlayerName,
  onToggleMute,
  onStartGame,
}) => {
  const [activeSample, setActiveSample] = useState<CalibrationLevel | null>(null);

  const handleSample = (level: CalibrationLevel) => {
    if (muted) {
      onToggleMute();
    }
    setActiveSample(level);
    waterAudio.playSampleCalibration(level, () => {
      setActiveSample((prev) => (prev === level ? null : prev));
    });
  };

  return (
    <div className="relative z-10 w-full h-full flex flex-col justify-between px-5 py-4 sm:px-8 sm:py-6 lg:px-14 lg:py-8 overflow-y-auto">
      {/* Top Utility Row (Mute toggle only - no website navbar) */}
      <div className="flex items-center justify-between w-full shrink-0">
        <div className="text-xs sm:text-sm text-amber-200/80 tracking-wide">
          夜市夏日祭典 · 2–6 人聽覺心理博弈
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl bg-[#1E2538]/85 border border-amber-200/20 text-[#FBF5E6] hover:border-amber-300/45 transition-colors flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-label={muted ? '開啟音效' : '靜音'}
        >
          {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}
          <span>{muted ? '音效已靜音' : '音效開啟中'}</span>
        </button>
      </div>

      {/* Main Content Split: Left Calm Lockup + Setup Card | Right Open Live Bottle Stage */}
      <div className="my-auto py-4 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center max-w-6xl w-full">
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Bespoke Inline SVG Title Lockup */}
          <div className="flex flex-col gap-2">
            <svg
              viewBox="0 0 540 112"
              className="w-full max-w-[440px] h-auto overflow-visible"
              role="img"
              aria-label="彈珠滿水祭 RAMUNE BRIM"
            >
              <defs>
                <linearGradient id="titleGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FEF3C7" />
                  <stop offset="55%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="titleCyan" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7DD3FC" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
              {/* Stylized Ramune Emblem */}
              <g transform="translate(8, 12)">
                <rect x="0" y="0" width="68" height="86" rx="14" fill="#172033" stroke="#F59E0B" strokeWidth="2.5" />
                <path
                  d="M27 12 H41 V22 C41 26 48 30 48 38 V70 C48 74 45 76 41 76 H27 C23 76 20 74 20 70 V38 C20 30 27 26 27 22 Z"
                  fill="rgba(56,189,248,0.22)"
                  stroke="#7DD3FC"
                  strokeWidth="2"
                />
                <rect x="21" y="42" width="26" height="33" rx="3" fill="#38BDF8" opacity="0.82" />
                <circle cx="34" cy="28" r="5" fill="#E0F2FE" />
                <path d="M56 26 Q62 34 56 42" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
                <path d="M61 21 Q69 34 61 47" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
              </g>
              {/* Title Typography */}
              <text
                x="94"
                y="60"
                fill="url(#titleGold)"
                fontSize="50"
                fontWeight="900"
                fontFamily="'Noto Sans TC', sans-serif"
                letterSpacing="3"
              >
                彈珠滿水祭
              </text>
              <text
                x="96"
                y="90"
                fill="url(#titleCyan)"
                fontSize="16"
                fontWeight="700"
                fontFamily="'Outfit', sans-serif"
                letterSpacing="5"
              >
                RAMUNE BRIM · 聽聲辨位派對
              </text>
            </svg>
            <p className="text-sm sm:text-base text-slate-200/90 max-w-xl leading-relaxed text-balance">
              水瓶完全遮蔽、每局水位隨機。輪流按住水龍頭倒水，聽聲辨別逼近瓶口的清脆共鳴，把最後一滴危險交給下一位！
            </p>
          </div>

          {/* Setup Card (Single-level surface, zero-pill, >= 44px touch targets) */}
          <div className="bg-[#181E2E]/90 border border-amber-200/18 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-5">
            {/* Player Count Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#FBF5E6]">
                <Users className="w-4 h-4 text-amber-400 shrink-0" />
                <span>遊玩人數</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 p-1 bg-[#0F1420] rounded-xl border border-white/10">
                {[2, 3, 4, 5, 6].map((count) => {
                  const active = playerCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => onChangePlayerCount(count)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-bold font-mono-num whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-500 text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {count}人
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Player Name Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#101522] border border-white/10 rounded-xl px-3 py-2 focus-within:border-sky-400/70 transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: PLAYER_PALETTE[idx % PLAYER_PALETTE.length] }}
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    maxLength={10}
                    value={playerNames[idx] ?? `玩家 ${idx + 1}`}
                    onChange={(e) => onChangePlayerName(idx, e.target.value)}
                    placeholder={`玩家 ${idx + 1}`}
                    aria-label={`玩家 ${idx + 1} 名稱`}
                    className="w-full bg-transparent text-sm text-[#FBF5E6] placeholder:text-slate-500 focus:outline-none min-w-0"
                  />
                </div>
              ))}
            </div>

            {/* Acoustic Calibration Preview (5 tiers) */}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>耳力校準試聽（5 段水位音高與音量，點擊聆聽）</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CALIBRATION_TIERS.map((item, idx) => {
                  const isPlaying = activeSample === item.key;
                  const isDangerTier = idx === CALIBRATION_TIERS.length - 1;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleSample(item.key)}
                      className={`min-h-[46px] px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-center ${
                        isDangerTier ? 'col-span-2 sm:col-span-1' : ''
                      } ${
                        isPlaying
                          ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                          : 'bg-[#101522] border-white/10 text-slate-200 hover:border-amber-300/40'
                      }`}
                    >
                      <span className="text-xs font-bold font-mono-num whitespace-nowrap truncate">{item.label}</span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap truncate">
                        {isPlaying ? '播放中…' : item.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Start CTA */}
            <button
              type="button"
              onClick={onStartGame}
              className="w-full min-h-[52px] px-6 py-3 rounded-xl bg-gradient-to-r from-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 active:scale-[0.99] text-slate-950 font-black text-base sm:text-lg tracking-wide shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>開始派對對決</span>
            </button>
          </div>
        </div>

        {/* Right Column spacer on desktop so live animated bottle is clearly visible */}
        <div className="hidden lg:block lg:col-span-5" aria-hidden="true" />
      </div>

      {/* Single flat control-hint line */}
      <div className="text-center lg:text-left text-xs text-slate-300/80 tracking-wide shrink-0 pt-2">
        長按螢幕或按住空白鍵倒水 · 放開交棒 · Esc 暫停
      </div>
    </div>
  );
};
