"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";
import { ActionButton } from "@/components/ActionButton";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const DIGITS = [1, 2, 3, 4] as const;
type GuessTuple = [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
type TeamTone = { bg: string; border: string; text: string; chip: string };
type TeamActionMeta = { label: string; active: boolean; mine: boolean };

const TEAM_TONES: TeamTone[] = [
  { bg: "#fff0ec", border: "#d18878", text: "#8e4336", chip: "#efc1b7" },
  { bg: "#eef7ec", border: "#91b88a", text: "#456b3d", chip: "#c7dec2" },
  { bg: "#ecf8f9", border: "#7fb9bd", text: "#2e6e74", chip: "#b9dde0" },
  { bg: "#f4effa", border: "#a796cb", text: "#584982", chip: "#d4c9ea" }
];

export default function Page() {
  const {
    state,
    availableRooms,
    error,
    debugMultiPlayer,
    createRoom,
    joinRoom,
    startGame,
    forceFinishGame,
    leaveRoom,
    disbandRoom,
    submitClues,
    submitGuess,
    aiAction,
    refreshJoinableRooms
  } = useGameSocket();
  const [nickname, setNickname] = useState("");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [playerCount, setPlayerCount] = useState<4 | 6 | 8>(4);
  const [clues, setClues] = useState<[string, string, string]>(["", "", ""]);
  const [guessByTarget, setGuessByTarget] = useState<Record<string, GuessTuple>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [disconnectSecondsLeft, setDisconnectSecondsLeft] = useState(30);
  const [roundPulse, setRoundPulse] = useState(false);
  const [actionSuccessState, setActionSuccessState] = useState<Record<string, boolean>>({});
  const [scoreFeedbackByTeam, setScoreFeedbackByTeam] = useState<Record<string, number>>({});
  const prevRoundRef = useRef<number | undefined>(undefined);
  const successTimersRef = useRef<Record<string, number>>({});
  const prevScoresRef = useRef<Record<string, number>>({});
  const scoreFeedbackTimersRef = useRef<Record<string, number>>({});
  const { confirm, confirmDialogNode } = useConfirmDialog();

  const myTeam = useMemo(() => state?.teams.find((t) => t.id === state.me.teamId), [state]);
  const myTeamId = state?.me.teamId;
  const myTeamLabel = myTeam?.label ?? "未分队";
  const winnerLabels = useMemo(() => {
    if (!state) {
      return [];
    }
    return (state.winnerTeamIds ?? []).map((id) => state.teams.find((t) => t.id === id)?.label ?? id);
  }, [state]);

  const mySpeakingAttempt = useMemo(() => {
    if (!state) {
      return undefined;
    }
    return state.currentAttempts.find((attempt) => attempt.speakerPlayerId === state.me.id);
  }, [state]);

  const myTeamAttempt = useMemo(() => {
    if (!state || !myTeamId) {
      return undefined;
    }
    return state.currentAttempts.find((attempt) => attempt.targetTeamId === myTeamId);
  }, [state, myTeamId]);

  const isHost = Boolean(state?.me.isHost);
  const canSubmitClues = Boolean(
    state?.status === "IN_GAME" &&
      state.phase === "SPEAKING" &&
      mySpeakingAttempt &&
      !mySpeakingAttempt.clues
  );

  const guessTargets = useMemo(() => {
    if (!state || state.status !== "IN_GAME" || state.phase !== "GUESSING" || !myTeamId) {
      return [];
    }

    return state.currentAttempts.filter((attempt) => {
      if (attempt.targetTeamId === myTeamId) {
        return attempt.internalGuesserPlayerId === state.me.id;
      }
      return true;
    });
  }, [state, myTeamId]);

  const getGuessForTarget = (targetTeamId: string): GuessTuple => {
    return guessByTarget[targetTeamId] ?? [1, 2, 3];
  };

  const isTargetSubmittedByMe = (targetTeamId: string): boolean => {
    if (!state) {
      return false;
    }
    const attempt = state.currentAttempts.find((item) => item.targetTeamId === targetTeamId);
    if (!attempt) {
      return false;
    }
    if (targetTeamId === state.me.teamId) {
      return attempt.internalGuessByMe;
    }
    return attempt.interceptPlayerIdsSubmitted.includes(state.me.id);
  };

  const submittedGuessCount = guessTargets.filter((attempt) => isTargetSubmittedByMe(attempt.targetTeamId)).length;
  const phaseSummary = state
    ? state.status === "LOBBY"
      ? "大厅准备阶段"
      : state.status === "FINISHED"
        ? "对局结束"
      : state.phase === "SPEAKING"
        ? "发言阶段 · 各队同步发言"
        : "猜测阶段 · 完成全部目标猜测"
    : "";

  const taskSummary = state
    ? state.status === "LOBBY"
      ? isHost
        ? "你的任务：等待人齐后开始游戏"
        : "你的任务：等待房主开始游戏"
      : state.status === "FINISHED"
        ? "你的任务：返回主界面"
      : state.phase === "SPEAKING"
        ? canSubmitClues
          ? "你的任务：提交 3 条线索"
          : myTeamAttempt && !myTeamAttempt.clues
            ? "你的任务：等待本队 speaker 发言"
            : "你的任务：等待其他队伍完成发言"
        : guessTargets.length === 0
          ? "你的任务：等待可猜测目标"
          : submittedGuessCount >= guessTargets.length
            ? "你的状态：已完成本轮全部猜测"
            : `你的任务：提交猜测（${submittedGuessCount}/${guessTargets.length}）`
    : "";
  const isFinished = state?.status === "FINISHED";
  const isWinner = Boolean(state && state.me.teamId && (state.winnerTeamIds ?? []).includes(state.me.teamId));
  const isTieWinner = Boolean(isWinner && (state?.winnerTeamIds?.length ?? 0) > 1);
  const resultTitle = isWinner ? (isTieWinner ? "并列胜利" : "胜利") : "失败";
  const resultDescription = isWinner
    ? isTieWinner
      ? "你所在队伍达成并列第一。"
      : "你所在队伍率先达成目标分。"
    : state?.finishedReason === "DISCONNECT_TIMEOUT"
      ? "有玩家断线超过 30 秒未恢复，系统自动结束本局。"
      : state?.finishedReason === "HOST_FORCED"
        ? "房主已强制结束本局。"
        : "本局未达成胜利条件。";
  const disconnectedNicknames = useMemo(() => {
    if (!state?.disconnectState) {
      return [];
    }
    const nicknameMap = new Map(state.teams.flatMap((team) => team.players.map((player) => [player.id, player.nickname] as const)));
    return state.disconnectState.disconnectedPlayerIds.map((id) => nicknameMap.get(id) ?? id);
  }, [state]);
  const deductionByTeam = useMemo(() => {
    if (!state) {
      return [];
    }
    return state.teams
      .map((team) => ({
        teamId: team.id,
        teamLabel: team.label,
        rows: state.deductionRows.filter((row) => row.teamId === team.id)
      }))
      .filter((group) => group.rows.length > 0);
  }, [state]);
  const teamToneById = useMemo(() => {
    if (!state) {
      return new Map<string, TeamTone>();
    }
    return new Map(state.teams.map((team, index) => [team.id, TEAM_TONES[index % TEAM_TONES.length]] as const));
  }, [state]);
  const teamActionMetaById = useMemo(() => {
    const meta = new Map<string, TeamActionMeta>();
    if (!state || state.status !== "IN_GAME") {
      return meta;
    }

    const attemptByTeamId = new Map(state.currentAttempts.map((attempt) => [attempt.targetTeamId, attempt] as const));
    for (const team of state.teams) {
      const attempt = attemptByTeamId.get(team.id);
      if (!attempt) {
        continue;
      }

      if (state.phase === "SPEAKING") {
        const submitted = Boolean(attempt.clues);
        const mine = attempt.speakerPlayerId === state.me.id && !submitted;
        meta.set(team.id, {
          label: submitted ? "已发言" : mine ? "你在发言" : "发言中",
          active: !submitted,
          mine
        });
        continue;
      }

      if (!attempt.internalGuessSubmitted) {
        const mine = attempt.internalGuesserPlayerId === state.me.id;
        meta.set(team.id, {
          label: mine ? "你待内猜" : "待内猜",
          active: true,
          mine
        });
        continue;
      }

      const requiredInterceptCount = state.teams.reduce((sum, item) => sum + (item.id === team.id ? 0 : item.players.length), 0);
      const interceptPending = attempt.interceptPlayerIdsSubmitted.length < requiredInterceptCount;
      const mine = state.me.teamId !== team.id && !attempt.interceptPlayerIdsSubmitted.includes(state.me.id);
      meta.set(team.id, {
        label: interceptPending ? (mine ? "你待截获" : "待截获") : "已完成",
        active: interceptPending,
        mine
      });
    }
    return meta;
  }, [state]);
  const roundProgress = useMemo(() => {
    if (!state || state.status !== "IN_GAME") {
      return undefined;
    }

    const speakingTotal = state.currentAttempts.length;
    const speakingDone = state.currentAttempts.filter((attempt) => Boolean(attempt.clues)).length;
    const internalTotal = state.currentAttempts.length;
    const internalDone = state.currentAttempts.filter((attempt) => attempt.internalGuessSubmitted).length;

    let interceptTotal = 0;
    let interceptDone = 0;
    for (const attempt of state.currentAttempts) {
      const requiredForAttempt = state.teams.reduce((sum, team) => sum + (team.id === attempt.targetTeamId ? 0 : team.players.length), 0);
      interceptTotal += requiredForAttempt;
      interceptDone += attempt.interceptPlayerIdsSubmitted.length;
    }

    const overallTotal = speakingTotal + internalTotal + interceptTotal;
    const overallDone = speakingDone + internalDone + interceptDone;

    return {
      overallDone,
      overallTotal,
      speakingDone,
      speakingTotal,
      internalDone,
      internalTotal,
      interceptDone,
      interceptTotal
    };
  }, [state]);
  const progressPercent = (done: number, total: number): number => {
    if (total <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  };

  const hasNickname = nickname.trim().length > 0;
  const speakingLeftPercent = Math.max(0, Math.min(100, Math.round((secondsLeft / 60) * 100)));
  const speakingWarning = Boolean(state?.status === "IN_GAME" && state.phase === "SPEAKING" && secondsLeft <= 10);
  const stageCardKey = useMemo(() => {
    if (!state) {
      return "no-state";
    }
    if (state.status === "IN_GAME") {
      return `${state.status}-${state.phase}-${state.round}`;
    }
    return `${state.status}-${state.round}`;
  }, [state]);

  useEffect(() => {
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    const savedNickname = storage.getItem("decrypto_nickname");
    if (savedNickname?.trim()) {
      const trimmed = savedNickname.trim();
      setNickname(trimmed);
      setNicknameDraft(trimmed);
    }
  }, [debugMultiPlayer]);

  useEffect(() => {
    if (!state?.me.nickname) {
      return;
    }
    setNickname((prev) => prev || state.me.nickname);
    setNicknameDraft((prev) => prev || state.me.nickname);
  }, [state?.me.nickname]);

  useEffect(() => {
    if (!state || state.phase !== "GUESSING") {
      setGuessByTarget({});
      return;
    }

    setGuessByTarget((prev) => {
      const next: Record<string, GuessTuple> = {};
      for (const attempt of state.currentAttempts) {
        next[attempt.targetTeamId] = prev[attempt.targetTeamId] ?? [1, 2, 3];
      }
      return next;
    });
  }, [state?.phase, state?.round, state?.currentAttempts]);

  useEffect(() => {
    if (!state || state.phase !== "SPEAKING" || !mySpeakingAttempt) {
      setSecondsLeft(60);
      return;
    }

    const timer = window.setInterval(() => {
      const delta = Date.now() - mySpeakingAttempt.startedAt;
      const left = Math.max(0, 60 - Math.floor(delta / 1000));
      setSecondsLeft(left);
    }, 500);

    return () => window.clearInterval(timer);
  }, [state, mySpeakingAttempt]);

  useEffect(() => {
    if (!state?.disconnectState || state.status !== "IN_GAME") {
      setDisconnectSecondsLeft(30);
      return;
    }

    const updateSeconds = () => {
      const left = Math.max(0, Math.ceil((state.disconnectState!.deadline - Date.now()) / 1000));
      setDisconnectSecondsLeft(left);
    };

    updateSeconds();
    const timer = window.setInterval(updateSeconds, 250);
    return () => window.clearInterval(timer);
  }, [state?.disconnectState, state?.status]);

  useEffect(() => {
    if (!state?.round) {
      return;
    }
    if (prevRoundRef.current !== undefined && prevRoundRef.current !== state.round) {
      setRoundPulse(true);
      const timer = window.setTimeout(() => setRoundPulse(false), 560);
      prevRoundRef.current = state.round;
      return () => window.clearTimeout(timer);
    }
    prevRoundRef.current = state.round;
  }, [state?.round]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasNickname) {
      return;
    }
    await createRoom(nickname, playerCount);
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    if (!hasNickname) {
      return;
    }
    await joinRoom(nickname, targetRoomId.toUpperCase());
  };

  const handleConfirmNickname = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nicknameDraft.trim();
    if (!trimmed) {
      return;
    }
    setNickname(trimmed);
    setNicknameDraft(trimmed);
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    storage.setItem("decrypto_nickname", trimmed);
  };

  const resetNickname = () => {
    setNickname("");
    setNicknameDraft("");
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    storage.removeItem("decrypto_nickname");
  };

  const fillByAI = async () => {
    if (!state?.me.teamId) {
      return;
    }
    const aiClues = await aiAction(state.me.teamId);
    setClues(aiClues);
  };

  const flashActionSuccess = (actionKey: string, durationMs = 1100) => {
    const existing = successTimersRef.current[actionKey];
    if (existing) {
      window.clearTimeout(existing);
    }
    setActionSuccessState((prev) => ({ ...prev, [actionKey]: true }));
    successTimersRef.current[actionKey] = window.setTimeout(() => {
      setActionSuccessState((prev) => ({ ...prev, [actionKey]: false }));
      delete successTimersRef.current[actionKey];
    }, durationMs);
  };

  const runActionWithSuccess = async (actionKey: string, action: () => Promise<unknown>) => {
    await action();
    flashActionSuccess(actionKey);
  };

  const submitMyGuess = async (targetTeamId: string): Promise<boolean> => {
    const guess = getGuessForTarget(targetTeamId);
    if (new Set(guess).size !== 3) {
      return false;
    }
    await submitGuess(targetTeamId, guess);
    return true;
  };

  const returnToHome = async () => {
    if (!state) {
      return;
    }
    if (isHost) {
      const shouldDisband = await confirm({
        title: "解散房间并返回主界面？",
        description: "当前房间会被解散，所有成员将返回大厅。",
        confirmText: "解散并返回",
        cancelText: "再想想",
        danger: true
      });
      if (!shouldDisband) {
        return;
      }
      await disbandRoom();
      return;
    }
    await leaveRoom();
  };

  const toggleDebugMode = () => {
    const params = new URLSearchParams(window.location.search);
    if (debugMultiPlayer) {
      params.delete("debug_multi_player");
    } else {
      params.set("debug_multi_player", "1");
    }
    const nextQuery = params.toString();
    window.location.search = nextQuery ? `?${nextQuery}` : "";
  };

  useEffect(() => {
    return () => {
      Object.values(successTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      Object.values(scoreFeedbackTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  useEffect(() => {
    if (!state?.teams?.length) {
      prevScoresRef.current = {};
      setScoreFeedbackByTeam({});
      return;
    }

    const prevScores = prevScoresRef.current;
    const nextScores: Record<string, number> = {};
    const deltas: Record<string, number> = {};

    for (const team of state.teams) {
      nextScores[team.id] = team.score;
      const prev = prevScores[team.id];
      if (typeof prev === "number" && team.score !== prev) {
        deltas[team.id] = team.score - prev;
      }
    }

    prevScoresRef.current = nextScores;
    if (Object.keys(deltas).length === 0) {
      return;
    }

    for (const [teamId, delta] of Object.entries(deltas)) {
      const activeTimer = scoreFeedbackTimersRef.current[teamId];
      if (activeTimer) {
        window.clearTimeout(activeTimer);
      }

      setScoreFeedbackByTeam((prev) => ({ ...prev, [teamId]: delta }));
      scoreFeedbackTimersRef.current[teamId] = window.setTimeout(() => {
        setScoreFeedbackByTeam((prev) => {
          const next = { ...prev };
          delete next[teamId];
          return next;
        });
        delete scoreFeedbackTimersRef.current[teamId];
      }, 1300);
    }
  }, [state?.teams, state?.round]);

  return (
    <main className="main-wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="muted" style={{ margin: 0 }}>
          调试模式：{debugMultiPlayer ? "开（多标签独立身份）" : "关（多标签共享身份）"}
        </p>
        <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={toggleDebugMode}>
          {debugMultiPlayer ? "关闭调试" : "开启调试"}
        </button>
      </div>

      {!state && (
        <>
          <p className="muted">Decrypto Online</p>
          <h1 className="big-title">截码战</h1>
          <p className="muted">米色清新 · 实时对局</p>
        </>
      )}

      {!state && (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h2 className="title">设定昵称</h2>
            {!hasNickname ? (
              <form onSubmit={handleConfirmNickname}>
                <div className="row wrap">
                  <input
                    className="input"
                    placeholder="你的昵称"
                    value={nicknameDraft}
                    onChange={(e) => setNicknameDraft(e.target.value)}
                  />
                  <button type="submit" className="btn">
                    确认昵称
                  </button>
                </div>
              </form>
            ) : (
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  当前昵称：{nickname}
                </p>
                <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={resetNickname}>
                  修改昵称
                </button>
              </div>
            )}
          </section>

          {hasNickname && (
            <>
              <section className="card" style={{ marginTop: 12 }}>
                <h2 className="title">创建房间</h2>
                <form onSubmit={handleCreate}>
                  <div className="row wrap">
                    <select className="select" value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value) as 4 | 6 | 8)}>
                      <option value={4}>4人 / 2队</option>
                      <option value={6}>6人 / 3队</option>
                      <option value={8}>8人 / 4队</option>
                    </select>
                    <button type="submit" className="btn">
                      创建
                    </button>
                  </div>
                </form>
              </section>

              <section className="card" style={{ marginTop: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <h2 className="title">可用房间</h2>
                  <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={() => refreshJoinableRooms()}>
                    刷新
                  </button>
                </div>

                {availableRooms.length === 0 && <p className="muted">当前没有可加入的房间。</p>}
                {availableRooms.map((room) => (
                  <div key={room.roomId} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                    <p style={{ margin: "0 0 6px" }}>
                      <strong>{room.roomName}</strong>
                    </p>
                    <p className="muted" style={{ margin: "0 0 8px" }}>
                      房间号 #{room.roomId} · 房主 {room.hostNickname} · 人数 {room.currentPlayerCount}/{room.targetPlayerCount}
                    </p>
                    <button className="btn secondary" onClick={() => handleJoinRoom(room.roomId)}>
                      加入该房间
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}

      {state && (
        <>
          {isFinished ? (
            <section key={`stage-card-${stageCardKey}`} className="card stage-card" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>{resultTitle}</strong>
                <span className={`badge round-badge ${roundPulse ? "pulse" : ""}`}>Round {state.round}</span>
              </div>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {resultDescription}
              </p>
              {winnerLabels.length > 0 && <p style={{ margin: "10px 0 0" }}>胜者：{winnerLabels.join("、")}</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={returnToHome}>
                  返回主界面
                </button>
              </div>
            </section>
          ) : (
            <section key={`stage-card-${stageCardKey}`} className="card stage-card" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>你在 {myTeamLabel}</strong>
                <span className={`badge round-badge ${roundPulse ? "pulse" : ""}`}>Round {state.round}</span>
              </div>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {phaseSummary}
              </p>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                {taskSummary}
              </p>
              {state.disconnectState && (
                <p style={{ margin: "8px 0 0", color: "var(--warning)" }}>
                  断线提醒：{disconnectedNicknames.join("、")} 已离线，{disconnectSecondsLeft}s 内未重连将自动结束对局。
                </p>
              )}
              {roundProgress && (
                <div className="progress-block">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="muted">本轮总进度</span>
                    <span className="muted">
                      {roundProgress.overallDone}/{roundProgress.overallTotal}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progressPercent(roundProgress.overallDone, roundProgress.overallTotal)}%` }}
                    />
                  </div>
                  <div className="progress-grid">
                    <div className="progress-item">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <span className="muted">发言</span>
                        <span className="muted">
                          {roundProgress.speakingDone}/{roundProgress.speakingTotal}
                        </span>
                      </div>
                      <div className="progress-track mini">
                        <div
                          className="progress-fill"
                          style={{ width: `${progressPercent(roundProgress.speakingDone, roundProgress.speakingTotal)}%` }}
                        />
                      </div>
                    </div>
                    <div className="progress-item">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <span className="muted">内猜</span>
                        <span className="muted">
                          {roundProgress.internalDone}/{roundProgress.internalTotal}
                        </span>
                      </div>
                      <div className="progress-track mini">
                        <div
                          className="progress-fill"
                          style={{ width: `${progressPercent(roundProgress.internalDone, roundProgress.internalTotal)}%` }}
                        />
                      </div>
                    </div>
                    <div className="progress-item">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <span className="muted">截获</span>
                        <span className="muted">
                          {roundProgress.interceptDone}/{roundProgress.interceptTotal}
                        </span>
                      </div>
                      <div className="progress-track mini">
                        <div
                          className="progress-fill"
                          style={{ width: `${progressPercent(roundProgress.interceptDone, roundProgress.interceptTotal)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {myTeam && <p className="muted" style={{ margin: "8px 0 0" }}>胜利进度：{myTeam.score} / 2 分</p>}
              {state.status === "IN_GAME" && isHost && (
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      const shouldForceFinish = await confirm({
                        title: "强制结束当前对局？",
                        description: "该操作会立即结束本局且不可撤销。",
                        confirmText: "立即结束",
                        cancelText: "取消",
                        danger: true
                      });
                      if (!shouldForceFinish) {
                        return;
                      }
                      await forceFinishGame();
                    }}
                  >
                    强制结束对局
                  </button>
                </div>
              )}
              {state.status === "LOBBY" && (
                <div className="row" style={{ marginTop: 10 }}>
                  {isHost ? (
                    <>
                      <ActionButton
                        className="btn"
                        success={Boolean(actionSuccessState["start-game"])}
                        onClick={async () => {
                          await runActionWithSuccess("start-game", () => startGame());
                        }}
                      >
                        {actionSuccessState["start-game"] ? "匹配已启动" : "开始游戏"}
                      </ActionButton>
                      <button
                        className="btn secondary"
                        onClick={async () => {
                          const shouldDisband = await confirm({
                            title: "确定解散房间？",
                            description: "房间解散后，所有成员会返回大厅。",
                            confirmText: "确认解散",
                            cancelText: "取消",
                            danger: true
                          });
                          if (!shouldDisband) {
                            return;
                          }
                          await disbandRoom();
                        }}
                      >
                        解散房间
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn secondary"
                      onClick={async () => {
                        const shouldLeave = await confirm({
                          title: "确定退出房间？",
                          description: "你将返回大厅，可再次加入该房间。",
                          confirmText: "确认退出",
                          cancelText: "取消"
                        });
                        if (!shouldLeave) {
                          return;
                        }
                        await leaveRoom();
                      }}
                    >
                      退出房间
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="card" style={{ marginTop: 10 }}>
            <h2 className="title">队伍状态</h2>
            {state.teams.map((team) => {
              const teamTone = teamToneById.get(team.id) ?? TEAM_TONES[0];
              const actionMeta = teamActionMetaById.get(team.id);
              const teamStyle = {
                "--team-bg": teamTone.bg,
                "--team-border": teamTone.border,
                "--team-text": teamTone.text,
                "--team-chip": teamTone.chip
              } as CSSProperties;

              return (
                <div
                  key={team.id}
                  className={`team-status-row ${actionMeta?.active ? "is-active" : ""} ${actionMeta?.mine ? "is-mine" : ""}`}
                  style={teamStyle}
                >
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ alignItems: "center" }}>
                      <span className="team-color-dot" />
                      <strong>{team.label}</strong>
                    </div>
                    <div className="row" style={{ alignItems: "center" }}>
                      {actionMeta && <span className={`team-action-badge ${actionMeta.mine ? "is-mine" : ""}`}>{actionMeta.label}</span>}
                      <span className={`team-score ${scoreFeedbackByTeam[team.id] ? "pop" : ""}`}>
                        积分 {team.score}
                        {scoreFeedbackByTeam[team.id] ? (
                          <span className={`team-score-delta ${scoreFeedbackByTeam[team.id] > 0 ? "plus" : "minus"}`}>
                            {scoreFeedbackByTeam[team.id] > 0 ? `+${scoreFeedbackByTeam[team.id]}` : scoreFeedbackByTeam[team.id]}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <p className="muted" style={{ margin: "5px 0" }}>
                    {team.players.map((p) => `${p.nickname}${p.online ? "" : "(离线)"}`).join(" · ")}
                  </p>
                </div>
              );
            })}
            {state.mySecretWords && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                <p className="muted" style={{ margin: 0 }}>
                  你的队伍词条
                </p>
                <div className="secret-grid">
                  {state.mySecretWords.map((word) => (
                    <div key={word.index} className="secret-item">
                      <span>{word.index}</span>
                      <span>{word.zh}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {canSubmitClues && mySpeakingAttempt && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">发言面板</h2>
              <div className={`countdown-block ${speakingWarning ? "warning pulse" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="muted">发言倒计时</span>
                  <span className="countdown-seconds">{secondsLeft}s</span>
                </div>
                <div className={`countdown-track ${speakingWarning ? "warning" : ""}`}>
                  <div className={`countdown-fill ${speakingWarning ? "warning" : ""}`} style={{ width: `${speakingLeftPercent}%` }} />
                </div>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                当前编码：{mySpeakingAttempt.code?.join("-")} · 剩余 {secondsLeft}s
              </p>
              <div className="grid-3">
                {clues.map((item, idx) => (
                  <input
                    key={idx}
                    className="input"
                    value={item}
                    maxLength={10}
                    placeholder={`线索 ${idx + 1}`}
                    onChange={(e) => {
                      const next = [...clues] as [string, string, string];
                      next[idx] = e.target.value;
                      setClues(next);
                    }}
                  />
                ))}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={fillByAI}>
                  AI 生成线索
                </button>
                <ActionButton
                  className="btn"
                  success={Boolean(actionSuccessState["submit-clues"])}
                  onClick={async () => {
                    await runActionWithSuccess("submit-clues", () => submitClues(clues));
                  }}
                >
                  {actionSuccessState["submit-clues"] ? "发言已锁定" : "提交发言"}
                </ActionButton>
              </div>
            </section>
          )}

          {state.status === "IN_GAME" && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">猜测面板</h2>
              {state.phase === "SPEAKING" && (
                <>
                  <p className="muted" style={{ marginTop: 8 }}>
                    发言阶段进行中，猜测将在下一阶段开放。
                  </p>
                </>
              )}
              {state.phase === "GUESSING" && guessTargets.length === 0 && <p className="muted">本阶段暂无可提交目标。</p>}
              {state.phase === "GUESSING" &&
                guessTargets.map((attempt) => {
                const targetLabel = state.teams.find((team) => team.id === attempt.targetTeamId)?.label ?? attempt.targetTeamId;
                const isInternal = attempt.targetTeamId === state.me.teamId;
                const currentGuess = getGuessForTarget(attempt.targetTeamId);
                const submitted = isTargetSubmittedByMe(attempt.targetTeamId);

                return (
                  <div key={attempt.targetTeamId} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
                    <p className="muted" style={{ marginTop: 0 }}>
                      目标：{targetLabel} · 类型：{isInternal ? "本队内猜" : "截获猜测"} · 线索：{(attempt.clues ?? []).join(" / ")}
                    </p>
                    <div className="grid-3">
                      {[0, 1, 2].map((idx) => (
                        <select
                          key={`${attempt.targetTeamId}-${idx}`}
                          className="select"
                          disabled={submitted}
                          value={currentGuess[idx]}
                          onChange={(e) => {
                            const next = [...currentGuess] as GuessTuple;
                            next[idx] = Number(e.target.value) as 1 | 2 | 3 | 4;
                            setGuessByTarget((prev) => ({
                              ...prev,
                              [attempt.targetTeamId]: next
                            }));
                          }}
                        >
                          {DIGITS.map((digit) => (
                            <option key={digit} value={digit}>
                              {digit}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <ActionButton
                      className="btn"
                      style={{ marginTop: 8 }}
                      disabled={submitted}
                      success={Boolean(actionSuccessState[`submit-guess-${attempt.targetTeamId}`])}
                      onClick={async () => {
                        const ok = await submitMyGuess(attempt.targetTeamId);
                        if (ok) {
                          flashActionSuccess(`submit-guess-${attempt.targetTeamId}`);
                        }
                      }}
                    >
                      {submitted
                        ? "已提交"
                        : actionSuccessState[`submit-guess-${attempt.targetTeamId}`]
                          ? "锁定成功"
                          : "提交猜测"}
                    </ActionButton>
                  </div>
                );
              })}
            </section>
          )}

          <div className="drawer-wrapper">
            <section className={`drawer ${drawerOpen ? "open" : ""}`}>
              <header className="drawer-header" onClick={() => setDrawerOpen((v) => !v)}>
                <strong>记录区（Deduction）</strong>
                <span className="muted">{drawerOpen ? "收起" : "展开"}</span>
              </header>
              <div className="drawer-body">
                {deductionByTeam.map((group) => {
                  const latestRound = Math.max(...group.rows.map((row) => row.round));
                  return (
                    <div key={group.teamId} className="record-team-block">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <p className="muted" style={{ margin: "0 0 6px" }}>
                          {group.teamLabel}
                          {group.teamId === state.me.teamId ? "（己方）" : "（对方）"}
                        </p>
                        <span className="record-round-chip">最新 R{latestRound}</span>
                      </div>
                      <table className="record-table">
                        <thead>
                          <tr>
                            <th>1</th>
                            <th>2</th>
                            <th>3</th>
                            <th>4</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row, index) => {
                            const age = latestRound - row.round;
                            const rowClassName = age === 0 ? "is-latest" : age <= 2 ? "is-recent" : "is-older";

                            return (
                              <tr key={`${group.teamId}-${row.round}-${index}`} className={rowClassName}>
                                <td>{row.byNumber[1]}</td>
                                <td>{row.byNumber[2]}</td>
                                <td>{row.byNumber[3]}</td>
                                <td>{row.byNumber[4]}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {deductionByTeam.length === 0 && <p className="muted">尚无记录。</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {confirmDialogNode}
    </main>
  );
}
