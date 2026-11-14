import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BottleConfig,
  GameState,
  MIN_POUR_MS,
  PLAYER_PALETTE,
  Player,
  PourSegment,
  RoundOutcome,
  TurnPhase,
} from './types/game';
import { waterAudio } from './audio/waterAudioEngine';
import { BottleStageCanvas, StageSimulationState } from './components/BottleStageCanvas';
import { TitleScreen } from './components/TitleScreen';
import {
  ActiveTurnBar,
  GameHUD,
  GameOverModal,
  PassDeviceOverlay,
  PauseModal,
  RoundRevealBar,
} from './components/GameOverlays';

const DEFAULT_NAMES = ['阿明', '小美', '大雄', '雅婷', '志豪', '可欣'];
const BACKDROP_URL = '/src/assets/images/ramune_stall_backdrop_1794643153093.jpg';

function createRandomBottle(roundNumber: number): BottleConfig {
  return {
    roundNumber,
    initialRatio: 0.14 + Math.random() * 0.30, // 14% - 44% hidden starting level
    capacityMs: 5200 + Math.random() * 2600, // 5.2s - 7.8s full capacity
    bottleLabel: `第 ${roundNumber} 瓶`,
    widthScale: 0.9 + Math.random() * 0.2,
  };
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('READY');
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);

  // Player roster configuration
  const [playerCount, setPlayerCount] = useState(3);
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);

  // Round & Bottle state
  const [roundNumber, setRoundNumber] = useState(1);
  const [roundOutcome, setRoundOutcome] = useState<RoundOutcome | null>(null);
  const [tooShortHint, setTooShortHint] = useState(false);

  // High-frequency mutable simulation state read directly by 60fps Canvas & pour tick
  const simRef = useRef<StageSimulationState>({
    gameState: 'TITLE_MENU',
    turnPhase: 'READY',
    isPouring: false,
    waterRatio: 0.2,
    initialRatio: 0.2,
    bottleWidthScale: 1,
    minPourProgress: 0,
    minPourReached: false,
    segments: [],
    overflowed: false,
    activePlayerColor: PLAYER_PALETTE[0],
    revealProgress: 0,
    shakePower: 0,
    hitstopTimer: 0,
  });

  const bottleRef = useRef<BottleConfig>(createRandomBottle(1));
  const turnStartRatioRef = useRef<number>(0);
  const turnPourElapsedMsRef = useRef<number>(0);
  const pourLoopRafRef = useRef<number | null>(null);
  const lastPourTickRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(gameState);
  const turnPhaseRef = useRef<TurnPhase>(turnPhase);
  const isPausedRef = useRef<boolean>(isPaused);
  const playersRef = useRef<Player[]>(players);
  const currentPlayerIdxRef = useRef<number>(currentPlayerIdx);

  gameStateRef.current = gameState;
  turnPhaseRef.current = turnPhase;
  isPausedRef.current = isPaused;
  playersRef.current = players;
  currentPlayerIdxRef.current = currentPlayerIdx;

  // Keep canvas simRef state flags synced with React state
  useEffect(() => {
    simRef.current.gameState = gameState;
    simRef.current.turnPhase = turnPhase;
  }, [gameState, turnPhase]);

  // Cleanup audio & timers on unmount
  useEffect(() => {
    return () => {
      if (pourLoopRafRef.current !== null) {
        window.cancelAnimationFrame(pourLoopRafRef.current);
      }
      waterAudio.dispose();
    };
  }, []);

  const stopPourLoop = useCallback(() => {
    if (pourLoopRafRef.current !== null) {
      window.cancelAnimationFrame(pourLoopRafRef.current);
      pourLoopRafRef.current = null;
    }
  }, []);

  const setupRound = useCallback(
    (nextRoundNum: number, roster: Player[], startingPlayerIdx: number) => {
      stopPourLoop();
      waterAudio.stopPour(false);

      const bottle = createRandomBottle(nextRoundNum);
      bottleRef.current = bottle;
      turnStartRatioRef.current = bottle.initialRatio;
      turnPourElapsedMsRef.current = 0;

      const activePlayer = roster[startingPlayerIdx];
      simRef.current = {
        ...simRef.current,
        gameState: 'PASS_DEVICE',
        turnPhase: 'READY',
        isPouring: false,
        waterRatio: bottle.initialRatio,
        initialRatio: bottle.initialRatio,
        bottleWidthScale: bottle.widthScale,
        minPourProgress: 0,
        minPourReached: false,
        segments: [],
        overflowed: false,
        activePlayerColor: activePlayer?.color ?? PLAYER_PALETTE[0],
        revealProgress: 0,
        shakePower: 0,
        hitstopTimer: 0,
      };

      setRoundNumber(nextRoundNum);
      setCurrentPlayerIdx(startingPlayerIdx);
      setRoundOutcome(null);
      setTooShortHint(false);
      setTurnPhase('READY');
      setGameState('PASS_DEVICE');
    },
    [stopPourLoop]
  );

  const handleStartGame = useCallback(() => {
    waterAudio.unlock();
    waterAudio.stopCalibration();

    const roster: Player[] = Array.from({ length: playerCount }).map((_, idx) => ({
      id: `p-${idx + 1}`,
      name: (playerNames[idx] || '').trim() || `玩家 ${idx + 1}`,
      color: PLAYER_PALETTE[idx % PLAYER_PALETTE.length],
      isEliminated: false,
      survivedTurns: 0,
      roundsWon: 0,
    }));

    setPlayers(roster);
    setIsPaused(false);
    setupRound(1, roster, 0);
  }, [playerCount, playerNames, setupRound]);

  const handleRestartSameRoster = useCallback(() => {
    waterAudio.unlock();
    const resetRoster = playersRef.current.map((p) => ({
      ...p,
      isEliminated: false,
      survivedTurns: 0,
      roundsWon: 0,
    }));
    setPlayers(resetRoster);
    setIsPaused(false);
    setupRound(1, resetRoster, 0);
  }, [setupRound]);

  const handleBackToTitle = useCallback(() => {
    stopPourLoop();
    waterAudio.stopPour(false);
    waterAudio.stopCalibration();
    setIsPaused(false);
    setTurnPhase('READY');
    setGameState('TITLE_MENU');
    simRef.current.isPouring = false;
    simRef.current.revealProgress = 0;
    simRef.current.overflowed = false;
  }, [stopPourLoop]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      waterAudio.setMuted(next);
      return next;
    });
  }, []);

  const triggerOverflow = useCallback(
    (finalRatio: number) => {
      stopPourLoop();
      waterAudio.playOverflow();

      const activePlayer = playersRef.current[currentPlayerIdxRef.current];
      const existingSegments = simRef.current.segments;
      const updatedSegments: PourSegment[] = activePlayer
        ? [
            ...existingSegments,
            {
              playerId: activePlayer.id,
              playerName: activePlayer.name,
              color: activePlayer.color,
              startRatio: turnStartRatioRef.current,
              endRatio: finalRatio,
            },
          ]
        : existingSegments;

      simRef.current.isPouring = false;
      simRef.current.overflowed = true;
      simRef.current.segments = updatedSegments;
      simRef.current.hitstopTimer = 0.065;
      simRef.current.shakePower = 20;
      simRef.current.revealProgress = 0.02;

      const updatedRoster = playersRef.current.map((p, idx) =>
        idx === currentPlayerIdxRef.current ? { ...p, isEliminated: true } : p
      );
      const survivingCount = updatedRoster.filter((p) => !p.isEliminated).length;

      setPlayers(updatedRoster);
      setTurnPhase('OVERFLOWED');
      setGameState('ROUND_REVEAL');
      setRoundOutcome({
        roundNumber: bottleRef.current.roundNumber,
        loserId: activePlayer?.id ?? '',
        loserName: activePlayer?.name ?? '玩家',
        finalRatio,
        initialRatio: bottleRef.current.initialRatio,
        segments: updatedSegments,
        survivingCount,
      });
    },
    [stopPourLoop]
  );

  const startPouring = useCallback(() => {
    if (
      gameStateRef.current !== 'PLAYING' ||
      isPausedRef.current ||
      (turnPhaseRef.current !== 'READY' && turnPhaseRef.current !== 'POURING')
    ) {
      return;
    }
    if (simRef.current.isPouring) return;

    waterAudio.unlock();
    setTooShortHint(false);
    simRef.current.isPouring = true;
    setTurnPhase('POURING');
    waterAudio.startPour(simRef.current.waterRatio);

    lastPourTickRef.current = performance.now();

    const tickPour = (now: number) => {
      if (!simRef.current.isPouring || gameStateRef.current !== 'PLAYING' || isPausedRef.current) {
        return;
      }
      const rawDtMs = now - lastPourTickRef.current;
      lastPourTickRef.current = now;
      const dtMs = Math.min(Math.max(rawDtMs, 1), 50);

      turnPourElapsedMsRef.current += dtMs;
      const prevMinReached = simRef.current.minPourReached;
      const minProgress = Math.min(1, turnPourElapsedMsRef.current / MIN_POUR_MS);
      simRef.current.minPourProgress = minProgress;

      if (!prevMinReached && minProgress >= 1) {
        simRef.current.minPourReached = true;
        waterAudio.playMinReached();
      }

      const deltaRatio = dtMs / bottleRef.current.capacityMs;
      const nextRatio = simRef.current.waterRatio + deltaRatio;
      simRef.current.waterRatio = nextRatio;
      waterAudio.updatePourLevel(nextRatio);

      if (nextRatio >= 1.0) {
        // Overflowed! Cap slight visual overshoot so foam erupts naturally
        const finalRatio = Math.min(1.06, nextRatio);
        simRef.current.waterRatio = finalRatio;
        triggerOverflow(finalRatio);
        return;
      }

      pourLoopRafRef.current = window.requestAnimationFrame(tickPour);
    };

    pourLoopRafRef.current = window.requestAnimationFrame(tickPour);
  }, [triggerOverflow]);

  const stopPouring = useCallback(() => {
    if (!simRef.current.isPouring) return;

    stopPourLoop();
    simRef.current.isPouring = false;
    waterAudio.stopPour(true);

    if (gameStateRef.current !== 'PLAYING') return;

    if (turnPourElapsedMsRef.current < MIN_POUR_MS) {
      // Released too early — allow player to hold a bit more to satisfy minimum pour
      setTooShortHint(true);
      setTurnPhase('READY');
      return;
    }

    // Safely completed minimum pour and stopped before overflow!
    const activePlayer = playersRef.current[currentPlayerIdxRef.current];
    if (activePlayer) {
      const seg: PourSegment = {
        playerId: activePlayer.id,
        playerName: activePlayer.name,
        color: activePlayer.color,
        startRatio: turnStartRatioRef.current,
        endRatio: simRef.current.waterRatio,
      };
      simRef.current.segments = [...simRef.current.segments, seg];
    }

    setPlayers((prev) =>
      prev.map((p, idx) =>
        idx === currentPlayerIdxRef.current
          ? { ...p, survivedTurns: p.survivedTurns + 1 }
          : p
      )
    );
    setTurnPhase('LOCKED');
  }, [stopPourLoop]);

  const findNextAliveIndex = useCallback((roster: Player[], fromIdx: number): number => {
    for (let step = 1; step <= roster.length; step++) {
      const idx = (fromIdx + step) % roster.length;
      if (!roster[idx].isEliminated) return idx;
    }
    return 0;
  }, []);

  const handleConfirmHandoff = useCallback(() => {
    const nextIdx = findNextAliveIndex(playersRef.current, currentPlayerIdxRef.current);
    const nextPlayer = playersRef.current[nextIdx];

    turnStartRatioRef.current = simRef.current.waterRatio;
    turnPourElapsedMsRef.current = 0;
    simRef.current.minPourProgress = 0;
    simRef.current.minPourReached = false;
    simRef.current.activePlayerColor = nextPlayer?.color ?? PLAYER_PALETTE[0];

    setCurrentPlayerIdx(nextIdx);
    setTooShortHint(false);
    setTurnPhase('READY');
    setGameState('PASS_DEVICE');
  }, [findNextAliveIndex]);

  const handleConfirmDeviceReady = useCallback(() => {
    waterAudio.unlock();
    turnStartRatioRef.current = simRef.current.waterRatio;
    turnPourElapsedMsRef.current = 0;
    simRef.current.minPourProgress = 0;
    simRef.current.minPourReached = false;
    setTooShortHint(false);
    setTurnPhase('READY');
    setGameState('PLAYING');
  }, []);

  const handleNextAfterReveal = useCallback(() => {
    const alive = playersRef.current.filter((p) => !p.isEliminated);
    if (alive.length <= 1) {
      waterAudio.playVictory();
      setGameState('GAME_OVER');
      return;
    }
    const nextStarterIdx = findNextAliveIndex(playersRef.current, currentPlayerIdxRef.current);
    setupRound(roundNumber + 1, playersRef.current, nextStarterIdx);
  }, [findNextAliveIndex, roundNumber, setupRound]);

  // Global keyboard bindings + window blur safety (clear held inputs!)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PASS_DEVICE') {
          e.preventDefault();
          stopPouring();
          setIsPaused((prev) => !prev);
        }
        return;
      }

      if (isTyping) return;

      if (e.code === 'Space') {
        if (e.repeat) return;
        if (gameStateRef.current === 'PLAYING' && !isPausedRef.current) {
          e.preventDefault();
          startPouring();
        } else if (gameStateRef.current === 'TITLE_MENU') {
          e.preventDefault();
          handleStartGame();
        }
      } else if (e.key === 'Enter') {
        if (gameStateRef.current === 'TITLE_MENU') {
          e.preventDefault();
          handleStartGame();
        } else if (gameStateRef.current === 'PASS_DEVICE' && !isPausedRef.current) {
          e.preventDefault();
          handleConfirmDeviceReady();
        } else if (gameStateRef.current === 'PLAYING' && turnPhaseRef.current === 'LOCKED' && !isPausedRef.current) {
          e.preventDefault();
          handleConfirmHandoff();
        } else if (gameStateRef.current === 'ROUND_REVEAL') {
          e.preventDefault();
          handleNextAfterReveal();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && simRef.current.isPouring) {
        e.preventDefault();
        stopPouring();
      }
    };

    const handleBlur = () => {
      if (simRef.current.isPouring) {
        stopPouring();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [
    handleConfirmDeviceReady,
    handleConfirmHandoff,
    handleNextAfterReveal,
    handleStartGame,
    startPouring,
    stopPouring,
  ]);

  const currentPlayer = players[currentPlayerIdx] ?? null;
  const winner = players.find((p) => !p.isEliminated) ?? players[0] ?? null;

  return (
    <main className="relative w-screen h-dvh overflow-hidden bg-[#0E1320] text-[#FBF5E6]">
      {/* Night-Market Stall Key Art Backdrop with CSS Fallback & Measured Contrast Scrim */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#161E31] via-[#111622] to-[#1A120D]">
        {!backdropFailed && (
          <img
            src={BACKDROP_URL}
            alt="復古夜市彈珠汽水攤位背景"
            referrerPolicy="no-referrer"
            onError={() => setBackdropFailed(true)}
            className="w-full h-full object-cover object-center opacity-55"
          />
        )}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            gameState === 'TITLE_MENU'
              ? 'bg-gradient-to-r from-[#0A0E17]/92 via-[#0A0E17]/72 to-[#0A0E17]/30'
              : 'bg-gradient-to-b from-[#0A0E17]/65 via-[#0A0E17]/40 to-[#0A0E17]/65'
          }`}
        />
      </div>

      {/* Isolated 60fps Canvas Stage */}
      <div className="absolute inset-0 z-[5]">
        <BottleStageCanvas
          simRef={simRef}
          interactive={gameState === 'PLAYING' && !isPaused && turnPhase !== 'LOCKED' && turnPhase !== 'OVERFLOWED'}
          onStagePointerDown={startPouring}
          onStagePointerUp={stopPouring}
        />
      </div>

      {/* State Machine Views */}
      {gameState === 'TITLE_MENU' && (
        <TitleScreen
          playerCount={playerCount}
          playerNames={playerNames}
          muted={muted}
          onChangePlayerCount={setPlayerCount}
          onChangePlayerName={(idx, name) =>
            setPlayerNames((prev) => {
              const next = [...prev];
              next[idx] = name;
              return next;
            })
          }
          onToggleMute={handleToggleMute}
          onStartGame={handleStartGame}
        />
      )}

      {gameState !== 'TITLE_MENU' && (
        <GameHUD
          gameState={gameState}
          roundNumber={roundNumber}
          players={players}
          currentPlayer={currentPlayer}
          muted={muted}
          onToggleMute={handleToggleMute}
          onOpenPause={() => {
            if (simRef.current.isPouring) stopPouring();
            setIsPaused(true);
          }}
        />
      )}

      {gameState === 'PASS_DEVICE' && currentPlayer && (
        <PassDeviceOverlay
          player={currentPlayer}
          roundNumber={roundNumber}
          muted={muted}
          onConfirmReady={handleConfirmDeviceReady}
          onUnmute={() => {
            if (muted) handleToggleMute();
          }}
        />
      )}

      {gameState === 'PLAYING' && currentPlayer && (
        <ActiveTurnBar
          player={currentPlayer}
          turnPhase={turnPhase}
          tooShortHint={tooShortHint}
          onConfirmHandoff={handleConfirmHandoff}
        />
      )}

      {gameState === 'ROUND_REVEAL' && roundOutcome && (
        <RoundRevealBar
          outcome={roundOutcome}
          hasNextRound={roundOutcome.survivingCount > 1}
          onNextRound={handleNextAfterReveal}
        />
      )}

      {gameState === 'GAME_OVER' && winner && (
        <GameOverModal
          winner={winner}
          players={players}
          onPlayAgain={handleRestartSameRoster}
          onBackToTitle={handleBackToTitle}
        />
      )}

      {isPaused && (
        <PauseModal
          muted={muted}
          onToggleMute={handleToggleMute}
          onResume={() => setIsPaused(false)}
          onRestart={handleRestartSameRoster}
          onBackToTitle={handleBackToTitle}
        />
      )}
    </main>
  );
}
